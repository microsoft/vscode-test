import * as path from 'path'
import * as cp from 'child_process'

import { runTests, downloadAndUnzipVSCode } from '../../lib/index'

async function go() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../../')
		const extensionTestsPath = path.resolve(__dirname, './suite')
		const testWorkspace = path.resolve(__dirname, '../../test-fixtures/fixture1')

		/**
     * Basic usage
     */
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath
		})

		const extensionTestsPath2 = path.resolve(__dirname, './suite2')
		const testWorkspace2 = path.resolve(__dirname, '../../test-fixtures/fixture2')

		/**
     * Running a second test suite
     */
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath: extensionTestsPath2,
			launchArgs: [testWorkspace2]
		})

		/**
     * Use 1.31.0 release for testing
     */
		await runTests({
			version: '1.31.0',
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace]
		})

		/**
     * Use Insiders release for testing
     */
		await runTests({
			version: 'insiders',
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace]
		})

		/**
     * Noop, since 1.31.0 already downloaded to .vscode-test/vscode-1.31.0
     */
		await downloadAndUnzipVSCode('1.31.0')

		/**
     * Manually download VS Code 1.30.0 release for testing.
     */
		const vscodeExecutablePath = await downloadAndUnzipVSCode('1.30.0')
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace]
		})

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
				'--disable-extensions'
			],
			// Custom environment variables for extension test script
			extensionTestsEnv: { foo: 'bar' }
		})

	} catch (err) {
		console.error('Failed to run tests')
		process.exit(1)
	}
}

go()
