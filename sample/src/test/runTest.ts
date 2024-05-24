import * as path from 'path';
import * as cp from 'child_process';

import { runTests, downloadAndUnzipVSCode, resolveCliArgsFromVSCodeExecutablePath, runVSCodeCommand } from '../../..';

async function go() {
	const extensionDevelopmentPath = path.resolve(__dirname, '../../../');
	const extensionTestsPath = path.resolve(__dirname, './suite');

	/**
	 * Basic usage
	 */
	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath,
	});

	const extensionTestsPath2 = path.resolve(__dirname, './suite2');
	const testWorkspace = path.resolve(__dirname, '../../src/test-fixtures/fixture1');

	/**
	 * Running another test suite on a specific workspace
	 */
	await runTests({
		extensionDevelopmentPath,
		extensionTestsPath: extensionTestsPath2,
		launchArgs: [testWorkspace],
	});

	/**
	 * Use 1.61.0 release for testing
	 */
	await runTests({
		version: '1.61.0',
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [testWorkspace],
	});

	/**
	 * Use Insiders release for testing
	 */
	await runTests({
		version: 'insiders',
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [testWorkspace],
	});

	/**
	 * Use unreleased Insiders (here be dragons!)
	 */
	await runTests({
		version: 'insiders-unreleased',
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [testWorkspace],
	});

	/**
	 * Use a specific Insiders commit for testing
	 */
	await runTests({
		version: '9d3fbb3d9a50055be0a8c6d721625d02c9de492d',
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [testWorkspace],
	});

	/**
	 * Noop, since 1.61.0 already downloaded to .vscode-test/vscode-1.61.0
	 */
	await downloadAndUnzipVSCode('1.61.0');

	/**
	 * Manually download VS Code 1.35.0 release for testing.
	 */
	const vscodeExecutablePath = await downloadAndUnzipVSCode('1.60.0');
	await runTests({
		vscodeExecutablePath,
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [testWorkspace],
	});

	/**
	 * Install Python extension
	 */
	await runVSCodeCommand(['--install-extension', 'ms-python.python'], { version: '1.60.0' });

	/**
	 * - Add additional launch flags for VS Code
	 * - Pass custom environment variables to test runner
	 */
	await runTests({
		vscodeExecutablePath,
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [
			testWorkspace,
			// This disables all extensions except the one being testing
			'--disable-extensions',
		],
		// Custom environment variables for extension test script
		extensionTestsEnv: { foo: 'bar' },
	});

	/**
	 * Use win64 instead of win32 for testing Windows
	 */
	if (process.platform === 'win32') {
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			version: '1.40.0',
			platform: 'win32-x64-archive',
		});
	}
}

go();
