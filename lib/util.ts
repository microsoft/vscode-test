/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { URL } from 'url';
import * as https from 'https';
import * as request from './request';
import { DownloadArchitecture, DownloadPlatform } from './download';
import * as createHttpsProxyAgent from 'https-proxy-agent';
import * as createHttpProxyAgent from 'http-proxy-agent';
import { readFileSync } from 'fs';
import { getProfileArguments, TestOptions } from './runTest';

export let systemDefaultPlatform: DownloadPlatform;

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

export const systemDefaultArchitecture = process.arch === 'arm64'
	? DownloadArchitecture.ARM64
	: process.arch === 'ia32'
	? DownloadArchitecture.X86
	: DownloadArchitecture.X64;

export function getVSCodeDownloadUrl(version: string, platform = systemDefaultPlatform, architecture = systemDefaultArchitecture) {

	let downloadSegment: string;
	switch (platform) {
		case 'darwin':
			downloadSegment = architecture === DownloadArchitecture.ARM64 ? 'darwin-arm64' : 'darwin';
			break;
		case 'win32-archive':
			downloadSegment = architecture === DownloadArchitecture.ARM64 ? 'win32-arm64-archive' : 'win32-archive';
			break;
		default:
			downloadSegment = platform;
			break;
	}

	if (version === 'insiders') {
		return `https://update.code.visualstudio.com/latest/${downloadSegment}/insider`;
	}
	return `https://update.code.visualstudio.com/${version}/${downloadSegment}/stable`;
}

let PROXY_AGENT: createHttpProxyAgent.HttpProxyAgent | undefined = undefined;
let HTTPS_PROXY_AGENT: createHttpsProxyAgent.HttpsProxyAgent | undefined = undefined;

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

export function downloadDirToExecutablePath(dir: string, platform: DownloadPlatform) {
	if (platform === 'win32-archive' || platform === 'win32-x64-archive') {
		return path.resolve(dir, 'Code.exe');
	} else if (platform === 'darwin') {
		return path.resolve(dir, 'Visual Studio Code.app/Contents/MacOS/Electron');
	} else {
		return path.resolve(dir, 'VSCode-linux-x64/code');
	}
}

export function insidersDownloadDirToExecutablePath(dir: string, platform: DownloadPlatform) {
	if (platform === 'win32-archive' || platform === 'win32-x64-archive') {
		return path.resolve(dir, 'Code - Insiders.exe');
	} else if (platform === 'darwin') {
		return path.resolve(dir, 'Visual Studio Code - Insiders.app/Contents/MacOS/Electron');
	} else {
		return path.resolve(dir, 'VSCode-linux-x64/code-insiders');
	}
}

export function insidersDownloadDirMetadata(dir: string, platform: DownloadPlatform) {
	let productJsonPath;
	if (platform === 'win32-archive' || platform === 'win32-x64-archive') {
		productJsonPath = path.resolve(dir, 'resources/app/product.json');
	} else if (platform === 'darwin') {
		productJsonPath = path.resolve(dir, 'Visual Studio Code - Insiders.app/Contents/Resources/app/product.json');
	} else {
		productJsonPath = path.resolve(dir, 'VSCode-linux-x64/resources/app/product.json');
	}
	const productJson = JSON.parse(readFileSync(productJsonPath, 'utf-8'));

	return {
		version: productJson.commit,
		date: new Date(productJson.date)
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
 * Usually you will want {@link resolveCliArgsFromVSCodeExecutablePath} instead.
 */
export function resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath: string, platform: DownloadPlatform) {
	if (platform === 'win32') {
		if (vscodeExecutablePath.endsWith('Code - Insiders.exe')) {
			return path.resolve(vscodeExecutablePath, '../bin/code-insiders.cmd');
		} else {
			return path.resolve(vscodeExecutablePath, '../bin/code.cmd');
		}
	} else if (platform === 'darwin') {
		return path.resolve(vscodeExecutablePath, '../../../Contents/Resources/app/bin/code');
	} else {
		if (vscodeExecutablePath.endsWith('code-insiders')) {
			return path.resolve(vscodeExecutablePath, '../bin/code-insiders');
		} else {
			return path.resolve(vscodeExecutablePath, '../bin/code');
		}
	}
}
/**
 * Resolve the VS Code cli arguments from executable path returned from `downloadAndUnzipVSCode`.
 * You can use this path to spawn processes for extension management. For example:
 *
 * ```ts
 * const cp = require('child_process');
 * const { downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath } = require('@vscode/test-electron')
 * const vscodeExecutablePath = await downloadAndUnzipVSCode('1.36.0');
 * const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
 *
 * cp.spawnSync(cli, [...args, '--install-extension', '<EXTENSION-ID-OR-PATH-TO-VSIX>'], {
 *   encoding: 'utf-8',
 *   stdio: 'inherit'
 * });
 * ```
 *
 * @param vscodeExecutablePath The `vscodeExecutablePath` from `downloadAndUnzipVSCode`.
 */
export function resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath: string, options?: Pick<TestOptions, 'reuseMachineInstall' | 'platform'>) {
	const args = [resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath, options?.platform ?? process.platform)];
	if (!options?.reuseMachineInstall) {
		args.push(...getProfileArguments(args));
	}

	return args;
}
