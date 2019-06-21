/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { downloadAndUnzipVSCode } from './download';

interface BaseTestOptions {
	/**
	 * The VS Code executable being used for testing.
	 *
	 * If not passed, will use options.version for downloading a copy of
	 * VS Code for testing. If `version` is not specified either, will
	 * download and use latest stable release.
	 */
	vscodeExecutablePath?: string;

	/**
	 * The VS Code version to download. Valid versions are:
	 * - `'insiders'`
	 * - `'1.32.0'`, `'1.31.1'`, etc
	 *
	 * Default to latest stable version.
	 */
	version?: string;

	/**
	 * Environment variables being passed to the test runner.
	 */
	testRunnerEnv?: {
		[key: string]: string | undefined;
	};

}

export interface TestOptions extends BaseTestOptions {
	/**
	 * Absolute path to the extension root. Passed to `--extensionDevelopmentPath`.
	 * Must include a `package.json` Extension Manifest.
	 */
	extensionPath: string;

	/**
	 * Absolute path to the test runner. Passed to `--extensionTestsPath`.
	 * Can be either a file path or a directory path that contains an `index.js`.
	 * Must export a `run` function of the following signature:
	 *
	 * ```ts
	 * function run(testsRoot: string, cb: (error: any, failures?: number) => void): void;
	 * ```
	 *
	 * When running integration test, the Extension Development Host will call this function
	 * that runs the test suite. The `cb` function should be called when the test suite finishes.
	 *
	 */
	testRunnerPath: string;

	/**
	 * A list of arguments prepended to the default VS Code launch arguments below:
	 *
	 * ```ts
	 * [
	 *   '--extensionDevelopmentPath=' + options.extPath,
	 *   '--extensionTestsPath=' + options.testPath
	 * ];
	 * ```
	 *
	 * See `code --help` for possible arguments.
	 */
	additionalLaunchArgs?: string[];
}

export async function runTests(options: TestOptions): Promise<number> {
	if (!options.vscodeExecutablePath) {
		options.vscodeExecutablePath = await downloadAndUnzipVSCode(options.version);
	}

	let args = [
		'--extensionDevelopmentPath=' + options.extensionPath,
		'--extensionTestsPath=' + options.testRunnerPath
	];

	if (options.additionalLaunchArgs) {
		args = options.additionalLaunchArgs.concat(args)
	}

	return innerRunTests(options.vscodeExecutablePath, args, options.testRunnerEnv);
}

async function innerRunTests(
	executable: string,
	args: string[],
	testRunnerEnv?: {
		[key: string]: string | undefined;
	}
): Promise<number> {
	return new Promise((resolve, reject) => {
		const fullEnv = Object.assign({}, process.env, testRunnerEnv);
		const cmd = cp.spawn(executable, args, { env: fullEnv });

		cmd.stdout.on('data', function(data) {
			const s = data.toString();
			if (!s.includes('update#setState idle')) {
				console.log(s);
			}
		});

		cmd.stderr.on('data', function(data) {
			const s = data.toString();
			if (!s.includes('stty: stdin')) {
				console.log(`Spawn Error: ${data.toString()}`);
			}
		});

		cmd.on('error', function(data) {
			console.log('Test error: ' + data.toString());
		});

		cmd.on('close', function(code) {
			console.log(`Exit code:   ${code}`);

			if (code !== 0) {
				reject('Failed');
			}

			console.log('Done\n');
			resolve(code);
		});
	});
}
