/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as request from './request';
import * as del from './del';
import {
	getVSCodeDownloadUrl,
	downloadDirToExecutablePath,
	insidersDownloadDirToExecutablePath,
	insidersDownloadDirMetadata,
	getLatestInsidersMetadata,
	systemDefaultPlatform
} from './util';
import { IncomingMessage } from 'http';
import { Extract as extract } from 'unzipper';
import { pipeline, Readable } from 'stream';
import { tmpdir } from 'os';
import { promisify } from 'util';
import { Console } from 'console';

const extensionRoot = process.cwd();

const vscodeStableReleasesAPI = `https://update.code.visualstudio.com/api/releases/stable`;

async function fetchLatestStableVersion(): Promise<string> {
	const versions = await request.getJSON(vscodeStableReleasesAPI);
	if (!versions || !Array.isArray(versions) || !versions[0]) {
		throw Error('Failed to get latest VS Code version');
	}

	return versions[0];
}

async function isValidVersion(version: string) {
	const validVersions: string[] = await request.getJSON(vscodeStableReleasesAPI);
	return version === 'insiders' || validVersions.indexOf(version) !== -1;
}

/**
 * Adapted from https://github.com/microsoft/TypeScript/issues/29729
 * Since `string | 'foo'` doesn't offer auto completion
 */
// eslint-disable-next-line @typescript-eslint/ban-types
type StringLiteralUnion<T extends U, U = string> = T | (U & {});
export type DownloadVersion = StringLiteralUnion<'insiders' | 'stable'>;
export type DownloadPlatform = StringLiteralUnion<'darwin' | 'win32-archive' | 'win32-x64-archive' | 'linux-x64'>;

export interface DownloadOptions {
	readonly cachePath: string;
	readonly version: DownloadVersion;
	readonly platform: DownloadPlatform;
	/** Whether or not to suppress output to stdout/stderr. */
	readonly silent: boolean;
	/** Whether or not to log all output to stderr instead of stdout. */
	readonly useStderr: boolean;
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

	const { silent } = options;

	const output = options.useStderr ? process.stderr : process.stdout;
	const downloadUrl = getVSCodeDownloadUrl(options.version, options.platform);
	const text = `Downloading VS Code ${options.version} from ${downloadUrl}`;
	silent || output.write(text);

	const res = await request.getStream(downloadUrl)
	if (res.statusCode !== 302) {
		throw 'Failed to get VS Code archive location';
	}
	const archiveUrl = res.headers.location;
	if (!archiveUrl) {
		throw 'Failed to get VS Code archive location';
	}

	const download = await request.getStream(archiveUrl);
	silent || printProgress(text, download, output);
	return { stream: download, format: archiveUrl.endsWith('.zip') ? 'zip' : 'tgz' } as const;
}

function printProgress(baseText: string, res: IncomingMessage, output: NodeJS.WriteStream) {
	if (!output.isTTY) {
		return;
	}

	const total = Number(res.headers['content-length']);
	let received = 0;
	let timeout: NodeJS.Timeout | undefined;

	const reset = '\x1b[G\x1b[0K';
	res.on('data', chunk => {
		if (!timeout) {
			timeout = setTimeout(() => {
				output.write(`${reset}${baseText}: ${received}/${total} (${((received / total) * 100).toFixed()}%)`);
				timeout = undefined;
			}, 100);
		}

		received += chunk.length;
	});

	res.on('end', () => {
		if (timeout) {
			clearTimeout(timeout);
		}

		output.write(`${reset}${baseText}: complete\n`);
	});

	res.on('error', err => {
		throw err;
	});
}

/**
 * Unzip a .zip or .tar.gz VS Code archive stream.
 */
async function unzipVSCode(
	extractDir: string,
	stream: Readable,
	format: 'zip' | 'tgz',
	silent = false,
	useStderr = false
) {
	if (format === 'zip') {
		// note: this used to use Expand-Archive, but this caused a failure
		// on longer file paths on windows. Instead use unzipper, which does
		// not have this limitation.
		//
		// However it has problems that prevent it working on OSX:
		// - https://github.com/ZJONSSON/node-unzipper/issues/216 (avoidable)
		// - https://github.com/ZJONSSON/node-unzipper/issues/115 (not avoidable)
		if (process.platform !== 'darwin') {
			await new Promise((resolve, reject) =>
				stream
					.pipe(extract({ path: extractDir }))
					.on('close', resolve)
					.on('error', reject)
			);
		} else {
			const stagingFile = path.join(tmpdir(), `vscode-test-${Date.now()}.zip`);

			try {
				await promisify(pipeline)(stream, fs.createWriteStream(stagingFile));
				await spawnDecompressorChild('unzip', ['-q', stagingFile, '-d', extractDir], undefined, silent, useStderr);
			} finally {
				// fs.unlink(stagingFile, () => undefined);
			}
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(extractDir)) {
			fs.mkdirSync(extractDir);
		}

		await spawnDecompressorChild('tar', ['-xzf', '-', '-C', extractDir], stream, silent, useStderr);
	}
}

function spawnDecompressorChild(
	command: string,
	args: ReadonlyArray<string>,
	input?: Readable,
	silent = false,
	useStderr = false
) {
	const child = cp.spawn(command, args, { stdio: 'pipe' });
	input?.pipe(child.stdin);
	if (!silent) {
		child.stderr.pipe(process.stderr);
		child.stdout.pipe(useStderr ? process.stderr : process.stdout);
	}

	return new Promise<void>((resolve, reject) => {
		child.on('error', reject);
		child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Failed to unzip archive, exited with ${code}`)));
	})
}

/**
 * Download and unzip a copy of VS Code.
 * @returns Promise of `vscodeExecutablePath`.
 */
export async function download(options?: Partial<DownloadOptions>): Promise<string> {
	let version = options?.version;
	let platform = options?.platform ?? systemDefaultPlatform;
	let cachePath = options?.cachePath ?? path.resolve(extensionRoot, '.vscode-test');
	const silent = options?.silent ?? false;
	const useStderr = options?.useStderr ?? false;

	const logger = useStderr ? new Console(process.stderr) : console;

	if (version) {
		if (version === 'stable') {
			version = await fetchLatestStableVersion();
		} else {
			/**
			 * Only validate version against server when no local download that matches version exists
			 */
			if (!fs.existsSync(path.resolve(cachePath, `vscode-${platform}-${version}`))) {
				if (!(await isValidVersion(version))) {
					throw Error(`Invalid version ${version}`);
				}
			}
		}
	} else {
		version = await fetchLatestStableVersion();
	}

	const downloadedPath = path.resolve(cachePath, `vscode-${platform}-${version}`);
	if (fs.existsSync(downloadedPath)) {
		if (version === 'insiders') {
			const { version: currentHash, date: currentDate } = insidersDownloadDirMetadata(downloadedPath);

			const { version: latestHash, timestamp: latestTimestamp } = await getLatestInsidersMetadata(
				systemDefaultPlatform
			);
			if (currentHash === latestHash) {
				silent || logger.log(`Found insiders matching latest Insiders release. Skipping download.`);
				return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath));
			} else {
				try {
					silent || logger.log(`Remove outdated Insiders at ${downloadedPath} and re-downloading.`);
					silent || logger.log(`Old: ${currentHash} | ${currentDate}`);
					silent || logger.log(`New: ${latestHash} | ${new Date(latestTimestamp).toISOString()}`);
					await del.rmdir(downloadedPath);
					silent || logger.log(`Removed ${downloadedPath}`);
				} catch (err) {
					silent || logger.error(err);
					throw Error(`Failed to remove outdated Insiders at ${downloadedPath}.`);
				}
			}
		} else {
			silent || logger.log(`Found ${downloadedPath}. Skipping download.`);

			return Promise.resolve(downloadDirToExecutablePath(downloadedPath));
		}
	}

	try {
		const { stream, format } = await downloadVSCodeArchive({ version, platform, cachePath, silent, useStderr });
		await unzipVSCode(downloadedPath, stream, format, silent, useStderr);
		silent || logger.log(`Downloaded VS Code ${version} into ${downloadedPath}`);
	} catch (err) {
		silent || logger.error(err);
		throw Error(`Failed to download and unzip VS Code ${version}`);
	}

	if (version === 'insiders') {
		return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath));
	} else {
		return downloadDirToExecutablePath(downloadedPath);
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
 * @param silent Whether or not to suppress output to stdout/stderr.
 * @param useStderr Whether or not to log all output to stderr instead of stdout.
 *
 * @returns Promise of `vscodeExecutablePath`.
 */
export async function downloadAndUnzipVSCode(
	version?: DownloadVersion,
	platform: DownloadPlatform = systemDefaultPlatform,
	silent = false,
	useStderr = false
): Promise<string> {
	return await download({ version, platform, silent, useStderr });
}
