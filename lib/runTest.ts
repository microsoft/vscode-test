/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as path from 'path';
import { DownloadOptions, defaultCachePath, downloadAndUnzipVSCode } from './download';
import { killTree } from './util';

export interface TestOptions extends Partial<DownloadOptions> {
	/**
	 * The VS Code executable path used for testing.
	 *
	 * If not passed, will use `options.version` to download a copy of VS Code for testing.
	 * If `version` is not specified either, will download and use latest stable release.
	 */
	vscodeExecutablePath?: string;

	/**
	 * Whether VS Code should be launched using default settings and extensions
	 * installed on this machine. If `false`, then separate directories will be
	 * used inside the `.vscode-test` folder within the project.
	 *
	 * Defaults to `false`.
	 */
	reuseMachineInstall?: boolean;

	/**
	 * Absolute path to the extension root. Passed to `--extensionDevelopmentPath`.
	 * Must include a `package.json` Extension Manifest.
	 */
	extensionDevelopmentPath: string | string[];

	/**
	 * Absolute path to the extension tests runner. Passed to `--extensionTestsPath`.
	 * Can be either a file path or a directory path that contains an `index.js`.
	 * Must export a `run` function of the following signature:
	 *
	 * ```ts
	 * function run(): Promise<void>;
	 * ```
	 *
	 * When running the extension test, the Extension Development Host will call this function
	 * that runs the test suite. This function should throws an error if any test fails.
	 *
	 * The first argument is the path to the file specified in `extensionTestsPath`.
	 *
	 */
	extensionTestsPath: string;

	/**
	 * Environment variables being passed to the extension test script.
	 */
	extensionTestsEnv?: {
		[key: string]: string | undefined;
	};

	/**
	 * A list of launch arguments passed to VS Code executable, in addition to `--extensionDevelopmentPath`
	 * and `--extensionTestsPath` which are provided by `extensionDevelopmentPath` and `extensionTestsPath`
	 * options.
	 *
	 * If the first argument is a path to a file/folder/workspace, the launched VS Code instance
	 * will open it.
	 *
	 * See `code --help` for possible arguments.
	 */
	launchArgs?: string[];
}

/**
 * Run VS Code extension test
 *
 * @returns The exit code of the command to launch VS Code extension test
 */
export async function runTests(options: TestOptions): Promise<number> {
	if (!options.vscodeExecutablePath) {
		options.vscodeExecutablePath = await downloadAndUnzipVSCode(options);
	}

	let args = [
		// https://github.com/microsoft/vscode/issues/84238
		'--no-sandbox',
		// https://github.com/microsoft/vscode-test/issues/221
		'--disable-gpu-sandbox',
		// https://github.com/microsoft/vscode-test/issues/120
		'--disable-updates',
		'--skip-welcome',
		'--skip-release-notes',
		'--disable-workspace-trust',
		'--extensionTestsPath=' + options.extensionTestsPath,
	];

	if (Array.isArray(options.extensionDevelopmentPath)) {
		args.push(...options.extensionDevelopmentPath.map((devPath) => `--extensionDevelopmentPath=${devPath}`));
	} else {
		args.push(`--extensionDevelopmentPath=${options.extensionDevelopmentPath}`);
	}

	if (options.launchArgs) {
		args = options.launchArgs.concat(args);
	}

	if (!options.reuseMachineInstall) {
		args.push(...getProfileArguments(args));
	}

	return innerRunTests(options.vscodeExecutablePath, args, options.extensionTestsEnv);
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

function hasArg(argName: string, argList: readonly string[]) {
	return argList.some((a) => a === `--${argName}` || a.startsWith(`--${argName}=`));
}

const SIGINT = 'SIGINT';

async function innerRunTests(
	executable: string,
	args: string[],
	testRunnerEnv?: {
		[key: string]: string | undefined;
	}
): Promise<number> {
	const fullEnv = Object.assign({}, process.env, testRunnerEnv);
	const shell = process.platform === 'win32';
	const cmd = cp.spawn(shell ? `"${executable}"` : executable, args, { env: fullEnv, shell });

	let exitRequested = false;
	const ctrlc1 = () => {
		process.removeListener(SIGINT, ctrlc1);
		process.on(SIGINT, ctrlc2);
		console.log('Closing VS Code gracefully. Press Ctrl+C to force close.');
		exitRequested = true;
		cmd.kill(SIGINT); // this should cause the returned promise to resolve
	};

	const ctrlc2 = () => {
		console.log('Closing VS Code forcefully.');
		process.removeListener(SIGINT, ctrlc2);
		exitRequested = true;
		killTree(cmd.pid!, true);
	};

	const prom = new Promise<number>((resolve, reject) => {
		if (cmd.pid) {
			process.on(SIGINT, ctrlc1);
		}

		cmd.stdout.on('data', (d) => process.stdout.write(d));
		cmd.stderr.on('data', (d) => process.stderr.write(d));

		cmd.on('error', function (data) {
			console.log('Test error: ' + data.toString());
		});

		let finished = false;
		function onProcessClosed(code: number | null, signal: NodeJS.Signals | null): void {
			if (finished) {
				return;
			}
			finished = true;
			console.log(`Exit code:   ${code ?? signal}`);

			// fix: on windows, it seems like these descriptors can linger for an
			// indeterminate amount of time, causing the process to hang.
			cmd.stdout.destroy();
			cmd.stderr.destroy();

			if (code === null) {
				reject(signal);
			} else if (code !== 0) {
				reject('Failed');
			} else {
				console.log('Done\n');
				resolve(code ?? -1);
			}
		}

		cmd.on('close', onProcessClosed);
		cmd.on('exit', onProcessClosed);
	});

	let code: number;
	try {
		code = await prom;
	} finally {
		process.removeListener(SIGINT, ctrlc1);
		process.removeListener(SIGINT, ctrlc2);
	}

	// exit immediately if we handled a SIGINT and no one else did
	if (exitRequested && process.listenerCount(SIGINT) === 0) {
		process.exit(1);
	}

	return code;
}
