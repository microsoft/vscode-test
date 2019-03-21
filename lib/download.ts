/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as request from './request';
import { getVSCodeDownloadUrl, urlToOptions, downloadDirToExecutablePath } from './util';

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
 * Download a copy of VS Code archive to `.vscode-test`.
 *
 * @param version The version of VS Code to download such as '1.32.0'. You can also use
 * 'insiders' for downloading latest Insiders.
 */
async function downloadVSCodeArchive(version: string): Promise<string> {
	if (!fs.existsSync(vscodeTestDir)) {
		fs.mkdirSync(vscodeTestDir);
	}

	return new Promise((resolve, reject) => {
		const requestOptions = urlToOptions(getVSCodeDownloadUrl(version));

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
				https.get(archiveRequestOptions, res => {
					res.pipe(outStream);
				});
			} else {
				const zipPath = path.resolve(vscodeTestDir, `vscode-${version}.tgz`);
				const outStream = fs.createWriteStream(zipPath);
				https.get(archiveRequestOptions, res => {
					res.pipe(outStream);
				});
				outStream.on('close', () => {
					resolve(zipPath);
				});
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

	if (vscodeArchivePath.endsWith('.zip')) {
		if (process.platform === 'win32') {
			cp.spawnSync('powershell.exe', [
				'-Command',
				`Expand-Archive -Path ${vscodeArchivePath} -DestinationPath ${extractDir}`
			]);
		} else {
			cp.spawnSync('unzip', [vscodeArchivePath, '-d', `${extractDir}`]);
		}
	} else {
		cp.spawnSync('tar', ['-xzf', vscodeArchivePath, '-C', extractDir]);
	}
}

/**
 * Download and unzip a copy of VS Code in `.vscode-test`. The paths are:
 * - `.vscode-test/vscode-<VERSION>`. For example, `./vscode-test/vscode-1.32.0`
 * - `./vscode-test/vscode-insiders`.
 *
 * @param version The version of VS Code to download such as '1.32.0'. You can also use
 * 'insiders' for downloading latest Insiders.
 */
export async function downloadAndUnzipVSCode(version?: string): Promise<string> {
	if (version) {
		if (!(await isValidVersion(version))) {
			throw Error(`Invalid version ${version}`);
		}
	} else {
		version = await fetchLatestStableVersion();
	}

	if (fs.existsSync(path.resolve(vscodeTestDir, `vscode-${version}`))) {
		console.log(`Found .vscode-test/vscode-${version}. Skipping download.`);
		return Promise.resolve(downloadDirToExecutablePath(path.resolve(vscodeTestDir, `vscode-${version}`)));
	}

	console.log(`Downloading VS Code ${version}`);
	const vscodeArchivePath = await downloadVSCodeArchive(version);
	if (fs.existsSync(vscodeArchivePath)) {
		unzipVSCode(vscodeArchivePath);
		console.log(`Downloaded VS Code ${version}`);
		// Remove archive
		fs.unlinkSync(vscodeArchivePath);
	}

	return downloadDirToExecutablePath(path.resolve(vscodeTestDir, `vscode-${version}`));
}
