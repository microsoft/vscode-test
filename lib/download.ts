/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { pipeline, Readable } from 'stream';
import { Extract as extract } from 'unzipper';
import { promisify } from 'util';
import * as del from './del';
import { ConsoleReporter, ProgressReporter, ProgressReportStage } from './progress';
import * as request from './request';
import {
	downloadDirToExecutablePath, getLatestInsidersMetadata, getVSCodeDownloadUrl, insidersDownloadDirMetadata, insidersDownloadDirToExecutablePath, isStableVersionIdentifier, systemDefaultPlatform
} from './util';

const extensionRoot = process.cwd();

const vscodeStableReleasesAPI = `https://update.code.visualstudio.com/api/releases/stable`;
const vscodeInsiderCommitsAPI = (platform: string) => `https://update.code.visualstudio.com/api/commits/insider/${platform}`;

const DOWNLOAD_ATTEMPTS = 3;

async function fetchLatestStableVersion(timeout: number): Promise<string> {
	const versions = await request.getJSON(vscodeStableReleasesAPI, timeout);
	if (!versions || !Array.isArray(versions) || !versions[0]) {
		throw Error('Failed to get latest VS Code version');
	}

	return versions[0];
}

async function isValidVersion(version: string, platform: string, timeout: number) {
	if (version === 'insiders') {
		return true;
	}

	const stableVersionNumbers: string[] = await request.getJSON(vscodeStableReleasesAPI, timeout);
	if (stableVersionNumbers.includes(version)) {
		return true;
	}

	const insiderCommits: string[] = await request.getJSON(vscodeInsiderCommitsAPI(platform), timeout);
	if (insiderCommits.includes(version)) {
		return true;
	}
}

/**
 * Adapted from https://github.com/microsoft/TypeScript/issues/29729
 * Since `string | 'foo'` doesn't offer auto completion
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type StringLiteralUnion<T extends string> = T | (string & {});
export type DownloadVersion = StringLiteralUnion<'insiders' | 'stable'>;
export type DownloadPlatform = StringLiteralUnion<'darwin' | 'darwin-arm64' | 'win32-archive' | 'win32-x64-archive' | 'linux-x64' | 'linux-arm64' | 'linux-armhf'>;

export interface DownloadOptions {
	readonly cachePath: string;
	readonly version: DownloadVersion;
	readonly platform: DownloadPlatform;
	readonly reporter?: ProgressReporter;
	readonly extractSync?: boolean;
	readonly timeout?: number;
}

/**
 * Download a copy of VS Code archive to `.vscode-test`.
 *
 * @param version The version of VS Code to download such as '1.32.0'. You can also use
 * `'stable'` for downloading latest stable release.
 * `'insiders'` for downloading latest Insiders.
 */
async function downloadVSCodeArchive(options: DownloadOptions) {
	if (!fs.existsSync(options.cachePath)) {
		fs.mkdirSync(options.cachePath);
	}

	const timeout = options.timeout!;
	const downloadUrl = getVSCodeDownloadUrl(options.version, options.platform);
	options.reporter?.report({ stage: ProgressReportStage.ResolvingCDNLocation, url: downloadUrl });
	const res = await request.getStream(downloadUrl, timeout)
	if (res.statusCode !== 302) {
		throw 'Failed to get VS Code archive location';
	}
	const url = res.headers.location;
	if (!url) {
		throw 'Failed to get VS Code archive location';
	}

	res.destroy();

	const download = await request.getStream(url, timeout);
	const totalBytes = Number(download.headers['content-length']);
	const contentType = download.headers['content-type'];
	const isZip = contentType ? contentType === 'application/zip' : url.endsWith('.zip');

	const timeoutCtrl = new request.TimeoutController(timeout);
	options.reporter?.report({ stage: ProgressReportStage.Downloading, url, bytesSoFar: 0, totalBytes });

	let bytesSoFar = 0;
	download.on('data', chunk => {
		bytesSoFar += chunk.length;
		timeoutCtrl.touch();
		options.reporter?.report({ stage: ProgressReportStage.Downloading, url, bytesSoFar, totalBytes });
	});

	download.on('end', () => {
		timeoutCtrl.dispose();
		options.reporter?.report({ stage: ProgressReportStage.Downloading, url, bytesSoFar: totalBytes, totalBytes });
	});

	timeoutCtrl.signal.addEventListener('abort', () => {
		download.emit('error', new request.TimeoutError(timeout));
		download.destroy();
	});

	return { stream: download, format: isZip ? 'zip' : 'tgz' } as const;
}

/**
 * Unzip a .zip or .tar.gz VS Code archive stream.
 */
async function unzipVSCode(reporter: ProgressReporter, extractDir: string, extractSync: boolean, stream: Readable, format: 'zip' | 'tgz') {
	const stagingFile = path.join(tmpdir(), `vscode-test-${Date.now()}.zip`);

	if (format === 'zip') {
		// note: this used to use Expand-Archive, but this caused a failure
		// on longer file paths on windows. Instead use unzipper, which does
		// not have this limitation.
		//
		// However it has problems that prevent it working on OSX:
		// - https://github.com/ZJONSSON/node-unzipper/issues/216 (avoidable)
		// - https://github.com/ZJONSSON/node-unzipper/issues/115 (not avoidable)
		if (process.platform === 'win32' && extractSync) {
			try {
				await promisify(pipeline)(stream, fs.createWriteStream(stagingFile));
				reporter.report({ stage: ProgressReportStage.ExtractingSynchonrously });
				await spawnDecompressorChild('powershell.exe', [
					'-NoProfile', '-ExecutionPolicy', 'Bypass', '-NonInteractive', '-NoLogo',
					'-Command', `Microsoft.PowerShell.Archive\\Expand-Archive -Path "${stagingFile}" -DestinationPath "${extractDir}"`
				]);
			} finally {
				fs.unlink(stagingFile, () => undefined);
			}
		} else if (process.platform !== 'darwin' && !extractSync) {
			await new Promise((resolve, reject) =>
				stream
					.on('error', reject)
					.pipe(extract({ path: extractDir }))
					.on('close', resolve)
					.on('error', reject)
			);
		} else { // darwin or *nix sync
			try {
				await promisify(pipeline)(stream, fs.createWriteStream(stagingFile));
				reporter.report({ stage: ProgressReportStage.ExtractingSynchonrously });
				await spawnDecompressorChild('unzip', ['-q', stagingFile, '-d', extractDir]);
			} finally {
				fs.unlink(stagingFile, () => undefined);
			}
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(extractDir)) {
			fs.mkdirSync(extractDir);
		}

		await spawnDecompressorChild('tar', ['-xzf', '-', '--strip-components=1', '-C', extractDir], stream);
	}
}

function spawnDecompressorChild(command: string, args: ReadonlyArray<string>, input?: Readable) {
	return new Promise<void>((resolve, reject) => {
		const child = cp.spawn(command, args, { stdio: 'pipe' });
		if (input) {
			input.on('error', reject);
			input.pipe(child.stdin);
		}

		child.stderr.pipe(process.stderr);
		child.stdout.pipe(process.stdout);

		child.on('error', reject);
		child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Failed to unzip archive, exited with ${code}`)));
	})
}

export const defaultCachePath = path.resolve(extensionRoot, '.vscode-test');

/**
 * Download and unzip a copy of VS Code.
 * @returns Promise of `vscodeExecutablePath`.
 */
export async function download(options: Partial<DownloadOptions> = {}): Promise<string> {
	let version = options?.version;
	const {
		platform = systemDefaultPlatform,
		cachePath = defaultCachePath,
		reporter = new ConsoleReporter(process.stdout.isTTY),
		extractSync = false,
		timeout = 15_000,
	} = options;

	if (version) {
		if (version === 'stable') {
			version = await fetchLatestStableVersion(timeout);
		} else {
			/**
			 * Only validate version against server when no local download that matches version exists
			 */
			if (!fs.existsSync(path.resolve(cachePath, `vscode-${platform}-${version}`))) {
				if (!(await isValidVersion(version, platform, timeout))) {
					throw Error(`Invalid version ${version}`);
				}
			}
		}
	} else {
		version = await fetchLatestStableVersion(timeout);
	}

	reporter.report({ stage: ProgressReportStage.ResolvedVersion, version });

	const downloadedPath = path.resolve(cachePath, `vscode-${platform}-${version}`);
	if (fs.existsSync(downloadedPath)) {
		if (version === 'insiders') {
			reporter.report({ stage: ProgressReportStage.FetchingInsidersMetadata });
			const { version: currentHash, date: currentDate } = insidersDownloadDirMetadata(downloadedPath, platform);

			const { version: latestHash, timestamp: latestTimestamp } = await getLatestInsidersMetadata(
				systemDefaultPlatform
			);
			if (currentHash === latestHash) {
				reporter.report({ stage: ProgressReportStage.FoundMatchingInstall, downloadedPath });
				return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath, platform));
			} else {
				try {
					reporter.report({
						stage: ProgressReportStage.ReplacingOldInsiders,
						downloadedPath,
						oldDate: currentDate,
						oldHash: currentHash,
						newDate: new Date(latestTimestamp),
						newHash: latestHash,
					});
					await del.rmdir(downloadedPath);
				} catch (err) {
					reporter.error(err);
					throw Error(`Failed to remove outdated Insiders at ${downloadedPath}.`);
				}
			}
		} else if (isStableVersionIdentifier(version)) {
			reporter.report({ stage: ProgressReportStage.FoundMatchingInstall, downloadedPath });
			return Promise.resolve(downloadDirToExecutablePath(downloadedPath, platform));
		} else {
			reporter.report({ stage: ProgressReportStage.FoundMatchingInstall, downloadedPath });
			return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath, platform))
		}
	}

	for (let i = 0; ; i++) {
		try {
			const { stream, format } = await downloadVSCodeArchive({ version, platform, cachePath, reporter, timeout });
			await unzipVSCode(reporter, downloadedPath, extractSync, stream, format);
			reporter.report({ stage: ProgressReportStage.NewInstallComplete, downloadedPath })
			break;
		} catch (error) {
			if (i++ < DOWNLOAD_ATTEMPTS) {
				reporter.report({ stage: ProgressReportStage.Retrying, attempt: i, error: error as Error, totalAttempts: DOWNLOAD_ATTEMPTS });
			} else {
				reporter.error(error);
				throw Error(`Failed to download and unzip VS Code ${version}`);
			}
		}
	}
	reporter.report({ stage: ProgressReportStage.NewInstallComplete, downloadedPath })

	if (isStableVersionIdentifier(version)) {
		return downloadDirToExecutablePath(downloadedPath, platform);
	} else {
		return insidersDownloadDirToExecutablePath(downloadedPath, platform);
	}
}

/**
 * Download and unzip a copy of VS Code in `.vscode-test`. The paths are:
 * - `.vscode-test/vscode-<PLATFORM>-<VERSION>`. For example, `./vscode-test/vscode-win32-1.32.0`
 * - `.vscode-test/vscode-win32-insiders`.
 *
 * *If a local copy exists at `.vscode-test/vscode-<PLATFORM>-<VERSION>`, skip download.*
 *
 * @param version The version of VS Code to download such as `1.32.0`. You can also use
 * `'stable'` for downloading latest stable release.
 * `'insiders'` for downloading latest Insiders.
 * When unspecified, download latest stable version.
 *
 * @returns Promise of `vscodeExecutablePath`.
 */
export async function downloadAndUnzipVSCode(options: Partial<DownloadOptions>): Promise<string>;
export async function downloadAndUnzipVSCode(
	version?: DownloadVersion,
	platform?: DownloadPlatform,
	reporter?: ProgressReporter,
	extractSync?: boolean,
): Promise<string>;
export async function downloadAndUnzipVSCode(
	versionOrOptions?: DownloadVersion | Partial<DownloadOptions>,
	platform?: DownloadPlatform,
	reporter?: ProgressReporter,
	extractSync?: boolean,
): Promise<string> {
	return await download(
		typeof versionOrOptions === 'object'
			? versionOrOptions as Partial<DownloadOptions>
			: { version: versionOrOptions, platform, reporter, extractSync }
	);
}
