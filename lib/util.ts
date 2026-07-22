/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChildProcess, SpawnOptions, spawn } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { HttpProxyAgent } from 'http-proxy-agent';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as path from 'path';
import { URL } from 'url';
import { DownloadOptions, DownloadPlatform, defaultCachePath, downloadAndUnzipVSCode } from './download';
import * as request from './request';
import { TestOptions } from './runTest';
import { ProgressReporter } from './progress';

export let systemDefaultPlatform: DownloadPlatform;

const isPlatformWindows = (platform: string) => platform.includes('win32');
const isPlatformDarwin = (platform: string) => platform.includes('darwin');
const isPlatformLinux = (platform: string) => platform.includes('linux');
export const isPlatformServer = (platform: string) => platform.includes('server');
export const isPlatformCLI = (platform: string) => platform.includes('cli-');

// Extract the architecture component from a download platform string. The
// legacy `darwin` / `server-darwin` names have no arch suffix and refer to x64.
const getPlatformArch = (platform: string): NodeJS.Architecture | undefined => {
	if (platform.includes('arm64')) return 'arm64';
	if (platform.includes('armhf')) return 'arm';
	if (platform.includes('x64')) return 'x64';
	if (isPlatformDarwin(platform)) return 'x64';
	return undefined;
};

export const isRunnableOnHost = (platform: string): boolean => {
	const osMatches =
		process.platform === 'win32'
			? isPlatformWindows(platform)
			: process.platform === 'darwin'
				? isPlatformDarwin(platform)
				: isPlatformLinux(platform);
	return osMatches && getPlatformArch(platform) === process.arch;
};

switch (process.platform) {
	case 'darwin':
		systemDefaultPlatform = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin';
		break;
	case 'win32':
		systemDefaultPlatform = process.arch === 'arm64' ? 'win32-arm64-archive' : 'win32-x64-archive';
		break;
	default:
		systemDefaultPlatform =
			process.arch === 'arm64' ? 'linux-arm64' : process.arch === 'arm' ? 'linux-armhf' : 'linux-x64';
}

const UNRELEASED_SUFFIX = '-unreleased';

export class Version {
	public static parse(version: string): Version {
		const unreleased = version.endsWith(UNRELEASED_SUFFIX);
		if (unreleased) {
			version = version.slice(0, -UNRELEASED_SUFFIX.length);
		}

		return new Version(version, !unreleased);
	}

	constructor(
		public readonly id: string,
		public readonly isReleased = true,
	) {}

	public get isCommit() {
		return /^[0-9a-f]{40}$/.test(this.id);
	}

	public get isInsiders() {
		return this.id === 'insiders' || this.id.endsWith('-insider');
	}

	public get isStable() {
		return this.id === 'stable' || /^[0-9]+\.[0-9]+\.[0-9]$/.test(this.id);
	}

	public toString() {
		return this.id + (this.isReleased ? '' : UNRELEASED_SUFFIX);
	}
}

export function getVSCodeDownloadUrl(version: Version, platform: string) {
	if (version.id === 'insiders') {
		return `https://update.code.visualstudio.com/latest/${platform}/insider?released=${version.isReleased}`;
	} else if (version.isInsiders) {
		return `https://update.code.visualstudio.com/${version.id}/${platform}/insider?released=${version.isReleased}`;
	} else if (version.isStable) {
		return `https://update.code.visualstudio.com/${version.id}/${platform}/stable?released=${version.isReleased}`;
	} else {
		// insiders commit hash
		return `https://update.code.visualstudio.com/commit:${version.id}/${platform}/insider`;
	}
}

let PROXY_AGENT: HttpProxyAgent<string> | undefined = undefined;
let HTTPS_PROXY_AGENT: HttpsProxyAgent<string> | undefined = undefined;

if (process.env.npm_config_proxy) {
	PROXY_AGENT = new HttpProxyAgent(process.env.npm_config_proxy);
	HTTPS_PROXY_AGENT = new HttpsProxyAgent(process.env.npm_config_proxy);
}
if (process.env.npm_config_https_proxy) {
	HTTPS_PROXY_AGENT = new HttpsProxyAgent(process.env.npm_config_https_proxy);
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
	if (isPlatformServer(platform)) {
		return isPlatformWindows(platform)
			? path.resolve(dir, 'bin', 'code-server.cmd')
			: path.resolve(dir, 'bin', 'code-server');
	} else if (isPlatformCLI(platform)) {
		return isPlatformWindows(platform) ? path.resolve(dir, 'code.exe') : path.resolve(dir, 'code');
	} else {
		if (isPlatformWindows(platform)) {
			return path.resolve(dir, 'Code.exe');
		} else if (isPlatformDarwin(platform)) {
			return resolveDarwinAppExecutable(path.resolve(dir, 'Visual Studio Code.app'));
		} else {
			return path.resolve(dir, 'code');
		}
	}
}

export function insidersDownloadDirToExecutablePath(dir: string, platform: DownloadPlatform) {
	if (isPlatformServer(platform)) {
		return isPlatformWindows(platform)
			? path.resolve(dir, 'bin', 'code-server-insiders.cmd')
			: path.resolve(dir, 'bin', 'code-server-insiders');
	} else if (isPlatformCLI(platform)) {
		return isPlatformWindows(platform) ? path.resolve(dir, 'code-insiders.exe') : path.resolve(dir, 'code-insiders');
	} else {
		if (isPlatformWindows(platform)) {
			return path.resolve(dir, 'Code - Insiders.exe');
		} else if (isPlatformDarwin(platform)) {
			return resolveDarwinAppExecutable(path.resolve(dir, 'Visual Studio Code - Insiders.app'));
		} else {
			return path.resolve(dir, 'code-insiders');
		}
	}
}

/**
 * Resolves the path to the main executable inside a macOS `.app` bundle.
 *
 * VS Code 1.110 renamed the macOS main binary from the historical
 * `Contents/MacOS/Electron` to the product name (`Code` on Stable,
 * `Code - Insiders` on Insiders) in microsoft/vscode#291948 (2026-02-03). A
 * compatibility symlink kept the old `Electron` name working until it was
 * removed in microsoft/vscode#326502 (2026-07-20), at which point downloads
 * from any 1.110+ archive fail to launch with `spawn .../Contents/MacOS/Electron ENOENT`.
 *
 * The resolution runs three tiers, each strictly narrower than the previous:
 *
 * 1. **`Info.plist` → `CFBundleExecutable`.** This is the authoritative source
 *    macOS itself uses to locate a bundle's main executable. VS Code ships
 *    the plist as XML, so a targeted regex avoids pulling in a plist parser
 *    or shelling out to `PlistBuddy`. The extracted value is treated as
 *    untrusted input: it must resolve directly under `Contents/MacOS/` (no
 *    `..` traversal, no absolute paths) and the resolved file must exist.
 *
 * 2. **Sole regular file in `Contents/MacOS/`.** VS Code bundles ship exactly
 *    one main binary in that directory across every historical variant
 *    (`Electron` pre-1.110, `Code`/`Code - Insiders` after), plus optionally
 *    a compatibility symlink to it. Filtering to regular files (excluding
 *    symlinks) collapses to a single entry that is safe to use even if the
 *    plist is missing, unreadable, in the binary plist format, or otherwise
 *    doesn't match the XML shape above.
 *
 * 3. **Legacy `Electron` name.** Preserves the historical behaviour for any
 *    pre-1.110 build where the first two tiers didn't fire (e.g. an unusual
 *    packaging layout). Kept as a last-resort so this function is always
 *    safe to call and never throws.
 *
 * See microsoft/vscode-test#348 and microsoft/vscode-test#349.
 */
function resolveDarwinAppExecutable(appPath: string): string {
	const macosDir = path.resolve(appPath, 'Contents', 'MacOS');
	const infoPlistPath = path.resolve(appPath, 'Contents', 'Info.plist');

	// Tier 1: read CFBundleExecutable from Info.plist, treating it as
	// untrusted input (guard against path traversal via a malformed plist).
	try {
		const plist = readFileSync(infoPlistPath, 'utf-8');
		const match = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/);
		if (match) {
			const candidate = path.resolve(macosDir, match[1]);
			if (candidate.startsWith(macosDir + path.sep) && existsSync(candidate)) {
				return candidate;
			}
		}
	} catch {
		// fall through to tier 2
	}

	// Tier 2: the sole regular (non-symlink) file in Contents/MacOS/.
	try {
		const files = readdirSync(macosDir, { withFileTypes: true }).filter((e) => e.isFile());
		if (files.length === 1) {
			return path.resolve(macosDir, files[0].name);
		}
	} catch {
		// fall through to tier 3
	}

	// Tier 3: legacy Electron name for pre-1.110 builds.
	return path.resolve(macosDir, 'Electron');
}

export function insidersDownloadDirMetadata(
	dir: string,
	platform: DownloadPlatform,
	reporter: ProgressReporter,
	latestHash: string,
) {
	let productJsonPath;
	if (isPlatformServer(platform)) {
		productJsonPath = path.resolve(dir, 'product.json');
	} else if (isPlatformWindows(platform)) {
		// https://github.com/microsoft/vscode/issues/293013
		// https://github.com/microsoft/vscode/issues/279329#issuecomment-3580527758
		// Recent Windows archives nest the application under a versioned folder
		// named after the first 10 characters of the commit hash, e.g.
		// `<dir>/39d5031f21/resources/app/product.json`. The installed build's
		// commit may differ from the server's latest, so we cannot assume the
		// folder is named after `latestHash`; locate the product.json instead.
		productJsonPath = findWindowsProductJsonPath(dir, latestHash);
	} else if (isPlatformDarwin(platform)) {
		productJsonPath = path.resolve(dir, 'Visual Studio Code - Insiders.app/Contents/Resources/app/product.json');
	} else {
		productJsonPath = path.resolve(dir, 'resources/app/product.json');
	}

	try {
		const productJson = JSON.parse(readFileSync(productJsonPath, 'utf-8'));

		return {
			version: productJson.commit,
			date: new Date(productJson.date),
		};
	} catch (e) {
		reporter.error(`Error reading product.json (${e}) will download again`);
		return {
			version: 'unknown',
			date: new Date(0),
		};
	}
}

/**
 * Resolves the path to `product.json` inside a downloaded Windows VS Code
 * archive, accounting for the versioned-resources folder introduced in
 * https://github.com/microsoft/vscode/issues/249239.
 */
function findWindowsProductJsonPath(dir: string, latestHash: string) {
	const relativeProductJsonPath = path.join('resources', 'app', 'product.json');

	// Preferred: the versioned folder named after the latest commit hash. When
	// the installed build is up to date this is an exact match.
	if (latestHash) {
		const hinted = path.resolve(dir, latestHash.slice(0, 10), relativeProductJsonPath);
		if (existsSync(hinted)) {
			return hinted;
		}
	}

	// Otherwise the install may be outdated and the folder named after a
	// different commit; scan for the versioned folder so we can still read the
	// currently-installed metadata (e.g. to report the old version being replaced).
	try {
		for (const entry of readdirSync(dir)) {
			if (/^[0-9a-f]{10}$/.test(entry)) {
				const candidate = path.resolve(dir, entry, relativeProductJsonPath);
				if (existsSync(candidate)) {
					return candidate;
				}
			}
		}
	} catch {
		// ignore, fall through to the legacy layout
	}

	// Legacy flat layout, where the app lives directly under the archive root.
	return path.resolve(dir, relativeProductJsonPath);
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

export async function getInsidersVersionMetadata(platform: string, version: string, released: boolean) {
	const remoteUrl = `https://update.code.visualstudio.com/api/versions/${version}/${platform}/insider?released=${released}`;
	return await request.getJSON<IUpdateMetadata>(remoteUrl, 30_000);
}

export async function getLatestInsidersMetadata(platform: string, released: boolean) {
	const remoteUrl = `https://update.code.visualstudio.com/api/update/${platform}/insider/latest?released=${released}`;
	return await request.getJSON<IUpdateMetadata>(remoteUrl, 30_000);
}

/**
 * Resolve the VS Code cli path from executable path returned from `downloadAndUnzipVSCode`.
 * Usually you will want {@link resolveCliArgsFromVSCodeExecutablePath} instead.
 */
export function resolveCliPathFromVSCodeExecutablePath(
	vscodeExecutablePath: string,
	platform: DownloadPlatform = systemDefaultPlatform,
) {
	if (platform === 'win32-archive') {
		throw new Error('Windows 32-bit is no longer supported');
	}
	if (isPlatformServer(platform) || isPlatformCLI(platform)) {
		// no separate CLI
		return vscodeExecutablePath;
	}
	if (isPlatformWindows(platform)) {
		if (vscodeExecutablePath.endsWith('Code - Insiders.exe')) {
			return path.resolve(vscodeExecutablePath, '../bin/code-insiders.cmd');
		} else {
			return path.resolve(vscodeExecutablePath, '../bin/code.cmd');
		}
	} else if (isPlatformDarwin(platform)) {
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
 *   shell: process.platform === 'win32',
 * });
 * ```
 *
 * @param vscodeExecutablePath The `vscodeExecutablePath` from `downloadAndUnzipVSCode`.
 */
export function resolveCliArgsFromVSCodeExecutablePath(
	vscodeExecutablePath: string,
	options?: Pick<TestOptions, 'reuseMachineInstall' | 'platform'>,
) {
	const args = [
		resolveCliPathFromVSCodeExecutablePath(vscodeExecutablePath, options?.platform ?? systemDefaultPlatform),
	];
	if (!options?.reuseMachineInstall) {
		args.push(...getProfileArguments(args));
	}

	return args;
}

export interface RunVSCodeCommandOptions extends Partial<DownloadOptions> {
	/**
	 * Additional options to pass to `child_process.spawn`
	 */
	spawn?: SpawnOptions;

	/**
	 * Whether VS Code should be launched using default settings and extensions
	 * installed on this machine. If `false`, then separate directories will be
	 * used inside the `.vscode-test` folder within the project.
	 *
	 * Defaults to `false`.
	 */
	reuseMachineInstall?: boolean;
}

/** Adds the extensions and user data dir to the arguments for the VS Code CLI */
export function getProfileArguments(args: readonly string[]) {
	const out: string[] = [];
	if (!hasArg('extensions-dir', args)) {
		out.push(`--extensions-dir=${path.join(defaultCachePath, 'extensions')}`);
	}

	if (!hasArg('user-data-dir', args)) {
		out.push(`--user-data-dir=${path.join(defaultCachePath, 'user-data')}`);
	}

	return out;
}

export function hasArg(argName: string, argList: readonly string[]) {
	return argList.some((a) => a === `--${argName}` || a.startsWith(`--${argName}=`));
}

export class VSCodeCommandError extends Error {
	constructor(
		args: string[],
		public readonly exitCode: number | null,
		public readonly stderr: string,
		public stdout: string,
	) {
		super(`'code ${args.join(' ')}' failed with exit code ${exitCode}:\n\n${stderr}\n\n${stdout}`);
	}
}

/**
 * Runs a VS Code command, and returns its output.
 *
 * @throws a {@link VSCodeCommandError} if the command fails
 */
export async function runVSCodeCommand(_args: readonly string[], options: RunVSCodeCommandOptions = {}) {
	const args = _args.slice();

	let executable = await downloadAndUnzipVSCode(options);
	let shell = false;
	if (!options.reuseMachineInstall) {
		args.push(...getProfileArguments(args));
	}

	// Unless the user is manually running tests or extension development, then resolve to the CLI script
	if (!hasArg('extensionTestsPath', args) && !hasArg('extensionDevelopmentPath', args)) {
		executable = resolveCliPathFromVSCodeExecutablePath(executable, options?.platform ?? systemDefaultPlatform);
		shell = process.platform === 'win32'; // CVE-2024-27980
	}

	return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
		let stdout = '';
		let stderr = '';

		const child = spawn(shell ? `"${executable}"` : executable, args, {
			stdio: 'pipe',
			shell,
			windowsHide: true,
			...options.spawn,
		});

		child.stdout?.setEncoding('utf-8').on('data', (data) => (stdout += data));
		child.stderr?.setEncoding('utf-8').on('data', (data) => (stderr += data));

		child.on('error', reject);
		child.on('exit', (code) => {
			if (code !== 0) {
				reject(new VSCodeCommandError(args, code, stderr, stdout));
			} else {
				resolve({ stdout, stderr });
			}
		});
	});
}

/** Predicates whether arg is undefined or null */
export function isDefined<T>(arg: T | undefined | null): arg is T {
	return arg != null;
}

/**
 * Validates the stream data matches the given length and checksum, if any.
 *
 * Note: md5 is not ideal, but it's what we get from the CDN, and for the
 * purposes of self-reported content verification is sufficient.
 */
export function validateStream(readable: NodeJS.ReadableStream, length: number, sha256?: string) {
	let actualLen = 0;
	const checksum = sha256 ? createHash('sha256') : undefined;
	return new Promise<void>((resolve, reject) => {
		readable.on('data', (chunk) => {
			checksum?.update(chunk);
			actualLen += chunk.length;
		});
		readable.on('error', reject);
		readable.on('end', () => {
			if (actualLen !== length) {
				return reject(new Error(`Downloaded stream length ${actualLen} does not match expected length ${length}`));
			}

			const digest = checksum?.digest('hex');
			if (digest && digest !== sha256) {
				return reject(new Error(`Downloaded file checksum ${digest} does not match expected checksum ${sha256}`));
			}

			resolve();
		});
	});
}

/** Gets a Buffer from a Node.js stream */
export function streamToBuffer(readable: NodeJS.ReadableStream) {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		readable.on('data', (chunk) => chunks.push(chunk));
		readable.on('error', reject);
		readable.on('end', () => resolve(Buffer.concat(chunks)));
	});
}
/** Gets whether child is a subdirectory of the parent */
export function isSubdirectory(parent: string, child: string) {
	const relative = path.relative(parent, child);
	return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Wraps a function so that it's called once, and never again, memoizing
 * the result unless it rejects.
 */
export function onceWithoutRejections<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>) {
	let value: Promise<T> | undefined;
	return (...args: Args) => {
		if (!value) {
			value = fn(...args).catch((err) => {
				value = undefined;
				throw err;
			});
		}

		return value;
	};
}

export function killTree(processId: number, force: boolean) {
	let cp: ChildProcess;

	if (process.platform === 'win32') {
		const windir = process.env['WINDIR'] || 'C:\\Windows';

		// when killing a process in Windows its child processes are *not* killed but become root processes.
		// Therefore we use TASKKILL.EXE
		cp = spawn(
			path.join(windir, 'System32', 'taskkill.exe'),
			[...(force ? ['/F'] : []), '/T', '/PID', processId.toString()],
			{ stdio: 'inherit' },
		);
	} else {
		// on linux and OS X we kill all direct and indirect child processes as well
		cp = spawn('sh', [path.resolve(__dirname, '../killTree.sh'), processId.toString(), force ? '9' : '15'], {
			stdio: 'inherit',
		});
	}

	return new Promise<void>((resolve, reject) => {
		cp.on('error', reject).on('exit', resolve);
	});
}
