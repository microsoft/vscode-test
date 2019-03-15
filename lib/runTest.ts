/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { downloadAndUnzipVSCode } from './download';

export interface TestOptions {
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
	 * Absolute path to the extension root. Must include a `package.json`
	 * Extension Manifest.
	 */
	extensionPath: string;

	/**
	 * Absolute path to the test suite folder. Must include an `index.js` that
	 * exports a test runner, such as:
	 *
	 * ```ts
	 * import * as testRunner from 'vscode/lib/testrunner';
	 * module.exports = testRunner;
	 * ```
	 */
	testRunnerPath: string;

	/**
	 * Absolute path of the fixture workspace to launch for testing
	 */
	testWorkspace: string;

	/**
	 * A list of arguments passed to `code` executable.
	 * See `code --help` for possible arguments.
	 *
	 * ```ts
	 * [
	 *   options.testWorkspace,
	 *   '--extensionDevelopmentPath=' + options.extPath,
	 *   '--extensionTestsPath=' + options.testPath,
	 *   '--locale=en'
	 * ];
	 * ```
	 */
	vscodeLaunchArgs?: string[];
}

export async function runTests(options: TestOptions): Promise<number> {
	if (!options.vscodeExecutablePath) {
		options.vscodeExecutablePath = await downloadAndUnzipVSCode(options.version);
	}

	return new Promise((resolve, reject) => {
		const args = [
			options.testWorkspace,
			'--extensionDevelopmentPath=' + options.extensionPath,
			'--extensionTestsPath=' + options.testRunnerPath,
			'--locale=en'
		];

		const cmd = cp.spawn(options.vscodeExecutablePath, args);

		cmd.stdout.on('data', function(data) {
			const s = data.toString();
			if (!s.includes('update#setState idle')) {
				console.log(s);
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
