/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as request from './request';
import * as del from './del';
import {
	getVSCodeDownloadUrl,
	urlToOptions,
	downloadDirToExecutablePath,
	insidersDownloadDirToExecutablePath,
	insidersDownloadDirMetadata,
	getLatestInsidersMetadata,
	systemDefaultPlatform
} from './util';

const extensionRoot = process.cwd();
const vscodeTestDir = path.resolve(extensionRoot, '.vscode-test');

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
type StringLiteralUnion<T extends U, U = string> = T | (U & {});
export type DownloadVersion = StringLiteralUnion<'insiders' | 'stable'>;
export type DownloadPlatform = StringLiteralUnion<'darwin' | 'win32-archive' | 'win32-x64-archive' | 'linux-x64'>;

/**
 * Download a copy of VS Code archive to `.vscode-test`.
 *
 * @param version The version of VS Code to download such as '1.32.0'. You can also use
 * `'stable'` for downloading latest stable release.
 * `'insiders'` for downloading latest Insiders.
 */
async function downloadVSCodeArchive(version: DownloadVersion, platform?: DownloadPlatform): Promise<string> {
	if (!fs.existsSync(vscodeTestDir)) {
		fs.mkdirSync(vscodeTestDir);
	}

	return new Promise((resolve, reject) => {
		const downloadUrl = getVSCodeDownloadUrl(version, platform);
		console.log(`Downloading VS Code ${version} from ${downloadUrl}`);
		const requestOptions = urlToOptions(downloadUrl);

		https.get(requestOptions, res => {
			if (res.statusCode !== 302) {
				reject('Failed to get VS Code archive location');
			}
			const archiveUrl = res.headers.location;
			if (!archiveUrl) {
				reject('Failed to get VS Code archive location');
				return;
			}

			const archiveRequestOptions = urlToOptions(archiveUrl);
			if (archiveUrl.endsWith('.zip')) {
				const archivePath = path.resolve(vscodeTestDir, `vscode-${version}.zip`);
				const outStream = fs.createWriteStream(archivePath);
				outStream.on('close', () => {
					resolve(archivePath);
				});

				https
					.get(archiveRequestOptions, res => {
						res.pipe(outStream);
					})
					.on('error', e => reject(e));
			} else {
				const zipPath = path.resolve(vscodeTestDir, `vscode-${version}.tgz`);
				const outStream = fs.createWriteStream(zipPath);
				outStream.on('close', () => {
					resolve(zipPath);
				});

				https
					.get(archiveRequestOptions, res => {
						res.pipe(outStream);
					})
					.on('error', e => reject(e));
			}
		});
	});
}

/**
 * Unzip a .zip or .tar.gz VS Code archive
 */
function unzipVSCode(vscodeArchivePath: string) {
	// The 'vscode-1.32' out of '.../vscode-1.32.zip'
	const dirName = path.parse(vscodeArchivePath).name;
	const extractDir = path.resolve(vscodeTestDir, dirName);

	let res: cp.SpawnSyncReturns<string>;
	if (vscodeArchivePath.endsWith('.zip')) {
		if (process.platform === 'win32') {
			res = cp.spawnSync('powershell.exe', [
				'-NoProfile',
				'-ExecutionPolicy',
				'Bypass',
				'-NonInteractive',
				'-NoLogo',
				'-Command',
				`Microsoft.PowerShell.Archive\\Expand-Archive -Path "${vscodeArchivePath}" -DestinationPath "${extractDir}"`
			]);
		} else {
			res = cp.spawnSync('unzip', [vscodeArchivePath, '-d', `${extractDir}`]);
		}
	} else {
		// tar does not create extractDir by default
		if (!fs.existsSync(extractDir)) {
			fs.mkdirSync(extractDir);
		}
		res = cp.spawnSync('tar', ['-xzf', vscodeArchivePath, '-C', extractDir]);
	}

	if (res && !(res.status === 0 && res.signal === null)) {
		throw Error(`Failed to unzip downloaded vscode at ${vscodeArchivePath}`);
	}
}

/**
 * Download and unzip a copy of VS Code in `.vscode-test`. The paths are:
 * - `.vscode-test/vscode-<VERSION>`. For example, `./vscode-test/vscode-1.32.0`
 * - `.vscode-test/vscode-insiders`.
 *
 * *If a local copy exists at `.vscode-test/vscode-<VERSION>`, skip download.*
 *
 * @param version The version of VS Code to download such as `1.32.0`. You can also use
 * `'stable'` for downloading latest stable release.
 * `'insiders'` for downloading latest Insiders.
 * When unspecified, download latest stable version.
 *
 * @returns Pormise of `vscodeExecutablePath`.
 */
export async function downloadAndUnzipVSCode(version?: DownloadVersion, platform?: DownloadPlatform): Promise<string> {
	if (version) {
		if (version === 'stable') {
			version = await fetchLatestStableVersion();
		} else {
			/**
			 * Only validate version against server when no local download that matches version exists
			 */
			if (!fs.existsSync(path.resolve(vscodeTestDir, `vscode-${version}`))) {
				if (!(await isValidVersion(version))) {
					throw Error(`Invalid version ${version}`);
				}
			}
		}
	} else {
		version = await fetchLatestStableVersion();
	}

	const downloadedPath = path.resolve(vscodeTestDir, `vscode-${version}`);
	if (fs.existsSync(downloadedPath)) {
		if (version === 'insiders') {
			const { version: currentHash, date: currentDate } = insidersDownloadDirMetadata(downloadedPath);

			const { version: latestHash, timestamp: latestTimestamp } = await getLatestInsidersMetadata(
				systemDefaultPlatform
			);
			if (currentHash === latestHash) {
				console.log(`Found .vscode-test/vscode-insiders matching latest Insiders release. Skipping download.`);
				return Promise.resolve(insidersDownloadDirToExecutablePath(downloadedPath));
			} else {
				try {
					console.log(`Remove outdated Insiders at ${downloadedPath} and re-downloading.`);
					console.log(`Old: ${currentHash} | ${currentDate}`);
					console.log(`New: ${latestHash} | ${new Date(parseInt(latestTimestamp, 10)).toISOString()}`);
					await del.rmdir(downloadedPath);
					console.log(`Removed ${downloadedPath}`);
				} catch (err) {
					console.error(err);
					throw Error(`Failed to remove outdated Insiders at ${downloadedPath}.`);
				}
			}
		} else {
			console.log(`Found .vscode-test/vscode-${version}. Skipping download.`);

			return Promise.resolve(downloadDirToExecutablePath(downloadedPath));
		}
	}

	try {
		const vscodeArchivePath = await downloadVSCodeArchive(version, platform);
		if (fs.existsSync(vscodeArchivePath)) {
			unzipVSCode(vscodeArchivePath);
			console.log(`Downloaded VS Code ${version} into .vscode-test/vscode-${version}`);
			// Remove archive
			fs.unlinkSync(vscodeArchivePath);
		}
	} catch (err) {
		console.error(err);
		throw Error(`Failed to download and unzip VS Code ${version}`);
	}

	if (version === 'insiders') {
		return Promise.resolve(insidersDownloadDirToExecutablePath(path.resolve(vscodeTestDir, `vscode-${version}`)));
	} else {
		return downloadDirToExecutablePath(path.resolve(vscodeTestDir, `vscode-${version}`));
	}
}
