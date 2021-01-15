/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { URL } from 'url';
import * as https from 'https';
import * as request from './request';
import { DownloadPlatform } from './download';
import * as createHttpProxyAgent from 'https-proxy-agent';
import * as createHttpsProxyAgent from 'http-proxy-agent';
import { readFileSync } from 'fs';

export let systemDefaultPlatform: string;

switch (process.platform) {
	case 'darwin':
		systemDefaultPlatform = 'darwin';
		break;
	case 'win32':
		systemDefaultPlatform = 'win32-archive';
		break;
	default:
		systemDefaultPlatform = 'linux-x64';
}

export function getVSCodeDownloadUrl(version: string, platform?: DownloadPlatform) {
	const downloadPlatform = platform || systemDefaultPlatform;

	if (version === 'insiders') {
		return `https://update.code.visualstudio.com/latest/${downloadPlatform}/insider`;
	}
	return `https://update.code.visualstudio.com/${version}/${downloadPlatform}/stable`;
}

let PROXY_AGENT: createHttpProxyAgent.HttpsProxyAgent | undefined = undefined;
let HTTPS_PROXY_AGENT: createHttpsProxyAgent.HttpProxyAgent | undefined = undefined;

if (process.env.npm_config_proxy) {
	PROXY_AGENT = createHttpProxyAgent(process.env.npm_config_proxy);
	HTTPS_PROXY_AGENT = createHttpsProxyAgent(process.env.npm_config_proxy);
}
if (process.env.npm_config_https_proxy) {
	HTTPS_PROXY_AGENT = createHttpsProxyAgent(process.env.npm_config_https_proxy);
}

export function urlToOptions(url: string): https.RequestOptions {
	const parsed = new URL(url);
	const options: https.RequestOptions = {};
	if (PROXY_AGENT && parsed.protocol.startsWith('http:')) {
		options.agent = PROXY_AGENT;
	}

	if (HTTPS_PROXY_AGENT && parsed.protocol.startsWith('https:')) {
		options.agent = HTTPS_PROXY_AGENT;
	}

	return options;
}

export function downloadDirToExecutablePath(dir: string) {
	if (process.platform === 'win32') {
		return path.resolve(dir, 'Code.exe');
	} else if (process.platform === 'darwin') {
		return path.resolve(dir, 'Visual Studio Code.app/Contents/MacOS/Electron');
	} else {
		return path.resolve(dir, 'VSCode-linux-x64/code');
	}
}

export function insidersDownloadDirToExecutablePath(dir: string) {
	if (process.platform === 'win32') {
		return path.resolve(dir, 'Code - Insiders.exe');
	} else if (process.platform === 'darwin') {
		return path.resolve(dir, 'Visual Studio Code - Insiders.app/Contents/MacOS/Electron');
	} else {
		return path.resolve(dir, 'VSCode-linux-x64/code-insiders');
	}
}

export function insidersDownloadDirMetadata(dir: string) {
	let productJsonPath;
	if (process.platform === 'win32') {
		productJsonPath = path.resolve(dir, 'resources/app/product.json');
	} else if (process.platform === 'darwin') {
		productJsonPath = path.resolve(dir, 'Visual Studio Code - Insiders.app/Contents/Resources/app/product.json');
	} else {
		productJsonPath = path.resolve(dir, 'VSCode-linux-x64/resources/app/product.json');
	}
	const productJson = JSON.parse(readFileSync(productJsonPath, 'utf-8'));

	return {
		version: productJson.commit,
		date: productJson.date
	};
}

export interface IUpdateMetadata {
	url: string;
	name: string;
	version: string;
	productVersion: string;
	hash: string;
	timestamp: number;
	sha256hash: string;
	supportsFastUpdate: boolean;
}

export async function getLatestInsidersMetadata(platform: string) {
	const remoteUrl = `https://update.code.visualstudio.com/api/update/${platform}/insider/latest`;
	return await request.getJSON<IUpdateMetadata>(remoteUrl);
}

/**
 * Resolve the VS Code cli path from executable path returned from `downloadAndUnzipVSCode`.
 * You can use this path to spawn processes for extension management. For example:
 *
 * ```ts
 * const cp = require('child_process');
 * const { downloadAndUnzipVSCode, resolveCliPathFromExecutablePath } = require('vscode-test')
 * const vscodeExecutablePath = await downloadAndUnzipVSCode('1.36.0');
 * const cliPath = resolveCliPathFromExecutablePath(vscodeExecutablePath);
 *
 * cp.spawnSync(cliPath, ['--install-extension', '<EXTENSION-ID-OR-PATH-TO-VSIX>'], {
 *   encoding: 'utf-8',
 *   stdio: 'inherit'
 * });
 * ```
 *
 * @param vscodeExecutablePath The `vscodeExecutablePath` from `downloadAndUnzipVSCode`.
 */
export function resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath: string) {
	if (process.platform === 'win32') {
		if (vscodeExecutablePath.endsWith('Code - Insiders.exe')) {
			return path.resolve(vscodeExecutablePath, '../bin/code-insiders.cmd');
		} else {
			return path.resolve(vscodeExecutablePath, '../bin/code.cmd');
		}
	} else if (process.platform === 'darwin') {
		return path.resolve(vscodeExecutablePath, '../../../Contents/Resources/app/bin/code');
	} else {
		if (vscodeExecutablePath.endsWith('code-insiders')) {
			return path.resolve(vscodeExecutablePath, '../bin/code-insiders');
		} else {
			return path.resolve(vscodeExecutablePath, '../bin/code');
		}
	}
}
