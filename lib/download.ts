/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as fs from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import * as semver from 'semver';
import { pipeline } from 'stream';
import { promisify } from 'util';
import { makeConsoleReporter, ProgressReporter, ProgressReportStage } from './progress.js';
import * as request from './request';
import {
	downloadDirToExecutablePath,
	getInsidersVersionMetadata,
	getLatestInsidersMetadata,
	getVSCodeDownloadUrl,
	insidersDownloadDirMetadata,
	insidersDownloadDirToExecutablePath,
	isDefined,
	isSubdirectory,
	onceWithoutRejections,
	streamToBuffer,
	systemDefaultPlatform,
	validateStream,
	Version,
} from './util';

const extensionRoot = process.cwd();
const pipelineAsync = promisify(pipeline);

const vscodeStableReleasesAPI = `https://update.code.visualstudio.com/api/releases/stable`;
const vscodeInsiderReleasesAPI = `https://update.code.visualstudio.com/api/releases/insider`;

const downloadDirNameFormat = /^vscode-(?<platform>[a-z]+)-(?<version>[0-9.]+)$/;
const makeDownloadDirName = (platform: string, version: Version) => `vscode-${platform}-${version.id}`;

const DOWNLOAD_ATTEMPTS = 3;

interface IFetchStableOptions {
	timeout: number;
	cachePath: string;
	platform: string;
}

interface IFetchInferredOptions extends IFetchStableOptions {
	extensionsDevelopmentPath?: string | string[];
}

// Turn off Electron's special handling of .asar files, otherwise
// extraction will fail when we try to extract node_modules.asar
// under Electron's Node (i.e. in the test CLI invoked by an extension)
// https://github.com/electron/packager/issues/875
//
// Also, trying to delete a directory with an asar in it will fail.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(process as any).noAsar = true;

export const fetchStableVersions = onceWithoutRejections((released: boolean, timeout: number) =>
	request.getJSON<string[]>(`${vscodeStableReleasesAPI}?released=${released}`, timeout)
);
export const fetchInsiderVersions = onceWithoutRejections((released: boolean, timeout: number) =>
	request.getJSON<string[]>(`${vscodeInsiderReleasesAPI}?released=${released}`, timeout)
);

/**
 * Returns the stable version to run tests against. Attempts to get the latest
 * version from the update sverice, but falls back to local installs if
 * not available (e.g. if the machine is offline).
 */
async function fetchTargetStableVersion({ timeout, cachePath, platform }: IFetchStableOptions): Promise<Version> {
	try {
		const versions = await fetchStableVersions(true, timeout);
		return new Version(versions[0]);
	} catch (e) {
		return fallbackToLocalEntries(cachePath, platform, e as Error);
	}
}

export async function fetchTargetInferredVersion(options: IFetchInferredOptions): Promise<Version> {
	if (!options.extensionsDevelopmentPath) {
		return fetchTargetStableVersion(options);
	}

	// load all engines versions from all development paths. Then, get the latest
	// stable version (or, latest Insiders version) that satisfies all
	// `engines.vscode` constraints.
	const extPaths = Array.isArray(options.extensionsDevelopmentPath)
		? options.extensionsDevelopmentPath
		: [options.extensionsDevelopmentPath];
	const maybeExtVersions = await Promise.all(extPaths.map(getEngineVersionFromExtension));
	const extVersions = maybeExtVersions.filter(isDefined);
	const matches = (v: string) => !extVersions.some((range) => !semver.satisfies(v, range, { includePrerelease: true }));

	try {
		const stable = await fetchStableVersions(true, options.timeout);
		const found1 = stable.find(matches);
		if (found1) {
			return new Version(found1);
		}

		const insiders = await fetchInsiderVersions(true, options.timeout);
		const found2 = insiders.find(matches);
		if (found2) {
			return new Version(found2);
		}

		const v = extVersions.join(', ');
		console.warn(`No version of VS Code satisfies all extension engine constraints (${v}). Falling back to stable.`);

		return new Version(stable[0]); // 🤷
	} catch (e) {
		return fallbackToLocalEntries(options.cachePath, options.platform, e as Error);
	}
}

async function getEngineVersionFromExtension(extensionPath: string): Promise<string | undefined> {
	try {
		const packageContents = await fs.promises.readFile(path.join(extensionPath, 'package.json'), 'utf8');
		const packageJson = JSON.parse(packageContents);
		return packageJson?.engines?.vscode;
	} catch {
		return undefined;
	}
}

async function fallbackToLocalEntries(cachePath: string, platform: string, fromError: Error) {
	const entries = await fs.promises.readdir(cachePath).catch(() => [] as string[]);
	const [fallbackTo] = entries
		.map((e) => downloadDirNameFormat.exec(e))
		.filter(isDefined)
		.filter((e) => e.groups!.platform === platform)
		.map((e) => e.groups!.version)
		.sort((a, b) => Number(b) - Number(a));

	if (fallbackTo) {
		console.warn(`Error retrieving VS Code versions, using already-installed version ${fallbackTo}`, fromError);
		return new Version(fallbackTo);
	}

	throw fromError;
}

async function isValidVersion(version: Version, timeout: number) {
	if (version.id === 'insiders' || version.id === 'stable' || version.isCommit) {
		return true;
	}

	if (version.isStable) {
		const stableVersionNumbers = await fetchStableVersions(version.isReleased, timeout);
		if (stableVersionNumbers.includes(version.id)) {
			return true;
		}
	}

	if (version.isInsiders) {
		const insiderVersionNumbers = await fetchInsiderVersions(version.isReleased, timeout);
		if (insiderVersionNumbers.includes(version.id)) {
			return true;
		}
	}

	return false;
}

/**
 * Adapted from https://github.com/microsoft/TypeScript/issues/29729
 * Since `string | 'foo'` doesn't offer auto completion
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type StringLiteralUnion<T extends string> = T | (string & {});
export type DownloadVersion = StringLiteralUnion<'insiders' | 'stable'>;
export type DownloadPlatform = StringLiteralUnion<
	'darwin' | 'darwin-arm64' | 'win32-x64-archive' | 'win32-arm64-archive' | 'linux-x64' | 'linux-arm64' | 'linux-armhf'
>;

export interface DownloadOptions {
	/**
	 * The VS Code version to download. Valid versions are:
	 * - `'stable'`
	 * - `'insiders'`
	 * - `'1.32.0'`, `'1.31.1'`, etc
	 *
	 * Defaults to `stable`, which is latest stable version.
	 *
	 * *If a local copy exists at `.vscode-test/vscode-<VERSION>`, skip download.*
	 */
	version: DownloadVersion;

	/**
	 * The VS Code platform to download. If not specified, it defaults to the
	 * current platform.
	 *
	 * Possible values are:
	 * 	- `win32-x64-archive`
	 * 	- `win32-arm64-archive		`
	 * 	- `darwin`
	 * 	- `darwin-arm64`
	 * 	- `linux-x64`
	 * 	- `linux-arm64`
	 * 	- `linux-armhf`
	 */
	platform: DownloadPlatform;

	/**
	 * Path where the downloaded VS Code instance is stored.
	 * Defaults to `.vscode-test` within your working directory folder.
	 */
	cachePath: string;

	/**
	 * Absolute path to the extension root. Passed to `--extensionDevelopmentPath`.
	 * Must include a `package.json` Extension Manifest.
	 */
	extensionDevelopmentPath?: string | string[];

	/**
	 * Progress reporter to use while VS Code is downloaded. Defaults to a
	 * console reporter. A {@link SilentReporter} is also available, and you
	 * may implement your own.
	 */
	reporter?: ProgressReporter;

	/**
	 * Whether the downloaded zip should be synchronously extracted. Should be
	 * omitted unless you're experiencing issues installing VS Code versions.
	 */
	extractSync?: boolean;

	/**
	 * Number of milliseconds after which to time out if no data is received from
	 * the remote when downloading VS Code. Note that this is an 'idle' timeout
	 * and does not enforce the total time VS Code may take to download.
	 */
	timeout?: number;
}

interface IDownload {
	stream: NodeJS.ReadableStream;
	format: 'zip' | 'tgz';
	sha256?: string;
	length: number;
}

function getFilename(contentDisposition: string) {
	const parts = contentDisposition.split(';').map((s) => s.trim());

	for (const part of parts) {
		const match = /^filename="?([^"]*)"?$/i.exec(part);

		if (match) {
			return match[1];
		}
	}

	return undefined;
}

/**
 * Download a copy of VS Code archive to `.vscode-test`.
 *
 * @param version The version of VS Code to download such as '1.32.0'. You can also use
 * `'stable'` for downloading latest stable release.
 * `'insiders'` for downloading latest Insiders.
 */
async function downloadVSCodeArchive(options: DownloadOptions): Promise<IDownload> {
	if (!fs.existsSync(options.cachePath)) {
		fs.mkdirSync(options.cachePath);
	}

	const timeout = options.timeout!;
	const version = Version.parse(options.version);
	const downloadUrl = getVSCodeDownloadUrl(version, options.platform);

	options.reporter?.report({ stage: ProgressReportStage.ResolvingCDNLocation, url: downloadUrl });
	const res = await request.getStream(downloadUrl, timeout);
	if (res.statusCode !== 302) {
		throw 'Failed to get VS Code archive location';
	}
	const url = res.headers.location;
	if (!url) {
		throw 'Failed to get VS Code archive location';
	}

	const contentSHA256 = res.headers['x-sha256'] as string | undefined;
	res.destroy();

	const download = await request.getStream(url, timeout);
	const totalBytes = Number(download.headers['content-length']);
	const contentDisposition = download.headers['content-disposition'];
	const fileName = contentDisposition ? getFilename(contentDisposition) : undefined;
	const isZip = fileName?.endsWith('zip') ?? url.endsWith('.zip');

	const timeoutCtrl = new request.TimeoutController(timeout);
	options.reporter?.report({
		stage: ProgressReportStage.Downloading,
		url,
		bytesSoFar: 0,
		totalBytes,
	});

	let bytesSoFar = 0;
	download.on('data', (chunk) => {
		bytesSoFar += chunk.length;
		timeoutCtrl.touch();
		options.reporter?.report({
			stage: ProgressReportStage.Downloading,
			url,
			bytesSoFar,
			totalBytes,
		});
	});

	download.on('end', () => {
		timeoutCtrl.dispose();
		options.reporter?.report({
			stage: ProgressReportStage.Downloading,
			url,
			bytesSoFar: totalBytes,
			totalBytes,
		});
	});

	timeoutCtrl.signal.addEventListener('abort', () => {
		download.emit('error', new request.TimeoutError(timeout));
		download.destroy();
	});

	return {
		stream: download,
		format: isZip ? 'zip' : 'tgz',
		sha256: contentSHA256,
		length: totalBytes,
	};
}

/**
 * Unzip a .zip or .tar.gz VS Code archive stream.
 */
async function unzipVSCode(
	reporter: ProgressReporter,
	extractDir: string,
	platform: DownloadPlatform,
	{ format, stream, length, sha256 }: IDownload
) {
	const stagingFile = path.join(tmpdir(), `vscode-test-${Date.now()}.zip`);
	const checksum = validateStream(stream, length, sha256);

	if (format === 'zip') {
		try {
			reporter.report({ stage: ProgressReportStage.ExtractingSynchonrously });

			// note: this used to use Expand-Archive, but this caused a failure
			// on longer file paths on windows. And we used to use the streaming
			// "unzipper", but the module was very outdated and a bit buggy.
			// Instead, use jszip. It's well-used and actually 8x faster than
			// Expand-Archive on my machine.
			if (process.platform === 'win32') {
				const [buffer, JSZip] = await Promise.all([streamToBuffer(stream), import('jszip')]);
				await checksum;

				const content = await JSZip.default.loadAsync(buffer);
				// extract file with jszip
				for (const filename of Object.keys(content.files)) {
					const file = content.files[filename];
					const filepath = path.join(extractDir, filename);
					if (file.dir) {
						continue;
					}

					// vscode update zips are trusted, but check for zip slip anyway.
					if (!isSubdirectory(extractDir, filepath)) {
						throw new Error(`Invalid zip file: ${filename}`);
					}

					await fs.promises.mkdir(path.dirname(filepath), { recursive: true });
					await pipelineAsync(file.nodeStream(), fs.createWriteStream(filepath));
				}
			} else {
				// darwin or *nix sync
				await pipelineAsync(stream, fs.createWriteStream(stagingFile));
				await checksum;
				await spawnDecompressorChild('unzip', ['-q', stagingFile, '-d', extractDir]);
			}
		} finally {
			fs.unlink(stagingFile, () => undefined);
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(extractDir)) {
			fs.mkdirSync(extractDir);
		}

		// The CLI is a singular binary that doesn't have a wrapper component to remove
		const s = platform.includes('cli-') ? 0 : 1;
		await spawnDecompressorChild('tar', ['-xzf', '-', `--strip-components=${s}`, '-C', extractDir], stream);
		await checksum;
	}
}

function spawnDecompressorChild(command: string, args: ReadonlyArray<string>, input?: NodeJS.ReadableStream) {
	return new Promise<void>((resolve, reject) => {
		const child = cp.spawn(command, args, { stdio: 'pipe' });
		if (input) {
			input.on('error', reject);
			input.pipe(child.stdin);
		}

		child.stderr.pipe(process.stderr);
		child.stdout.pipe(process.stdout);

		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`Failed to unzip archive, exited with ${code}`))
		);
	});
}

export const defaultCachePath = path.resolve(extensionRoot, '.vscode-test');

const COMPLETE_FILE_NAME = 'is-complete';

/**
 * Download and unzip a copy of VS Code.
 * @returns Promise of `vscodeExecutablePath`.
 */
export async function download(options: Partial<DownloadOptions> = {}): Promise<string> {
	const inputVersion = options?.version ? Version.parse(options.version) : undefined;
	const {
		platform = systemDefaultPlatform,
		cachePath = defaultCachePath,
		reporter = await makeConsoleReporter(),
		timeout = 15_000,
	} = options;

	let version: Version;
	if (inputVersion?.id === 'stable') {
		version = await fetchTargetStableVersion({ timeout, cachePath, platform });
	} else if (inputVersion) {
		/**
		 * Only validate version against server when no local download that matches version exists
		 */
		if (!fs.existsSync(path.resolve(cachePath, makeDownloadDirName(platform, inputVersion)))) {
			if (!(await isValidVersion(inputVersion, timeout))) {
				throw Error(`Invalid version ${inputVersion.id}`);
			}
		}
		version = inputVersion;
	} else {
		version = await fetchTargetInferredVersion({
			timeout,
			cachePath,
			platform,
			extensionsDevelopmentPath: options.extensionDevelopmentPath,
		});
	}

	if (platform === 'win32-archive' && semver.satisfies(version.id, '>= 1.85.0', { includePrerelease: true })) {
		throw new Error('Windows 32-bit is no longer supported from v1.85 onwards');
	}

	reporter.report({ stage: ProgressReportStage.ResolvedVersion, version: version.toString() });

	const downloadedPath = path.resolve(cachePath, makeDownloadDirName(platform, version));
	if (fs.existsSync(path.join(downloadedPath, COMPLETE_FILE_NAME))) {
		if (version.isInsiders) {
			reporter.report({ stage: ProgressReportStage.FetchingInsidersMetadata });
			const { version: currentHash, date: currentDate } = insidersDownloadDirMetadata(downloadedPath, platform);

			const { version: latestHash, timestamp: latestTimestamp } =
				version.id === 'insiders' // not qualified with a date
					? await getLatestInsidersMetadata(systemDefaultPlatform, version.isReleased)
					: await getInsidersVersionMetadata(systemDefaultPlatform, version.id, version.isReleased);

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
					await fs.promises.rm(downloadedPath, { force: true, recursive: true });
				} catch (err) {
					reporter.error(err);
					throw Error(`Failed to remove outdated Insiders at ${downloadedPath}.`);
				}
			}
		} else if (version.isStable) {
			reporter.report({ stage: ProgressReportStage.FoundMatchingInstall, downloadedPath });
			return Promise.resolve(downloadDirToExecutablePath(downloadedPath, platform));
		} else {
			reporter.report({ stage: ProgressReportStage.FoundMatchingInstall, downloadedPath });
			return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath, platform));
		}
	}

	for (let i = 0; ; i++) {
		try {
			await fs.promises.rm(downloadedPath, { recursive: true, force: true });

			const download = await downloadVSCodeArchive({
				version: version.toString(),
				platform,
				cachePath,
				reporter,
				timeout,
			});
			// important! do not put anything async here, since unzipVSCode will need
			// to start consuming the stream immediately.
			await unzipVSCode(reporter, downloadedPath, platform, download);

			await fs.promises.writeFile(path.join(downloadedPath, COMPLETE_FILE_NAME), '');
			reporter.report({ stage: ProgressReportStage.NewInstallComplete, downloadedPath });
			break;
		} catch (error) {
			if (i++ < DOWNLOAD_ATTEMPTS) {
				reporter.report({
					stage: ProgressReportStage.Retrying,
					attempt: i,
					error: error as Error,
					totalAttempts: DOWNLOAD_ATTEMPTS,
				});
			} else {
				reporter.error(error);
				throw Error(`Failed to download and unzip VS Code ${version}`);
			}
		}
	}
	reporter.report({ stage: ProgressReportStage.NewInstallComplete, downloadedPath });

	if (version.isStable) {
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
	extractSync?: boolean
): Promise<string>;
export async function downloadAndUnzipVSCode(
	versionOrOptions?: DownloadVersion | Partial<DownloadOptions>,
	platform?: DownloadPlatform,
	reporter?: ProgressReporter,
	extractSync?: boolean
): Promise<string> {
	return await download(
		typeof versionOrOptions === 'object'
			? (versionOrOptions as Partial<DownloadOptions>)
			: { version: versionOrOptions, platform, reporter, extractSync }
	);
}
