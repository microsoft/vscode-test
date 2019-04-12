/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { downloadAndUnzipVSCode } from './download';

const enum OptionType {
	Default,
	Explicit
}

export interface TestOptions {
	type: OptionType.Default;

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
	 * A list of arguments appended to the default VS Code launch arguments below:
	 *
	 * ```ts
	 * [
	 *   options.testWorkspace,
	 *   '--extensionDevelopmentPath=' + options.extPath,
	 *   '--extensionTestsPath=' + options.testPath,
	 *   '--locale=' + (options.locale || 'en')
	 * ];
	 * ```
	 *
	 * See `code --help` for possible arguments.
	 */
	additionalLaunchArgs?: string[];

	/**
	 * The locale to use (e.g. `en-US` or `zh-TW`).
	 * If not specified, it defaults to `en`.
	 */
	locale?: string;
}

export interface ExplicitTestOptions {
	type: OptionType.Explicit;

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
	 * A list of arguments used for launching VS Code executable.
	 *
	 * You need to provide `--extensionDevelopmentPath` and `--extensionTestsPath` manually when
	 * using this option. If you want to open a specific workspace for testing, you need to pass
	 * the absolute path of the workspace as first item in this list.
	 *
	 * See `code --help` for possible arguments.
	 */
	 launchArgs: string[];
}

type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

export async function runTests(options: Omit<TestOptions, 'type'> | Omit<ExplicitTestOptions, 'type'>): Promise<number> {
	const innerOptions: TestOptions | ExplicitTestOptions = ((<ExplicitTestOptions>options).launchArgs)
		? <TestOptions>{ type: OptionType.Default, ...options }
		: <ExplicitTestOptions>{ type: OptionType.Explicit, ...options};

	if (!innerOptions.vscodeExecutablePath) {
		innerOptions.vscodeExecutablePath = await downloadAndUnzipVSCode(innerOptions.version);
	}

	return new Promise((resolve, reject) => {
		let args = [];

		if (innerOptions.type === OptionType.Default) {
			args = [
				innerOptions.testWorkspace,
				'--extensionDevelopmentPath=' + innerOptions.extensionPath,
				'--extensionTestsPath=' + innerOptions.testRunnerPath,
				'--locale=' + (innerOptions.locale || 'en')
			];

			if (innerOptions.additionalLaunchArgs) {
				args = args.concat(innerOptions.additionalLaunchArgs);
			}
		} else {
			args = innerOptions.launchArgs;
		}

		const cmd = cp.spawn(innerOptions.vscodeExecutablePath, args);

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
