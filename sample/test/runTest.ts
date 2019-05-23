import * as path from 'path'

import { runTests, downloadAndUnzipVSCode } from 'vscode-test'

async function go() {
  try {
    const extensionPath = path.resolve(__dirname, '../../')
    const testRunnerPath = path.resolve(__dirname, './suite')
    const testWorkspace = path.resolve(__dirname, '../../test-fixtures/fixture1')

    /**
     * Basic usage
     */
    await runTests({
      extensionPath,
      testRunnerPath,
      testWorkspace
    })

    const testRunnerPath2 = path.resolve(__dirname, './suite2')
    const testWorkspace2 = path.resolve(__dirname, '../../test-fixtures/fixture2')

    /**
     * Running a second test suite
     */
    await runTests({
      extensionPath,
      testRunnerPath: testRunnerPath2,
      testWorkspace: testWorkspace2
    })

    /**
     * Use 1.31.0 release for testing
     */
    await runTests({
      version: '1.31.0',
      extensionPath,
      testRunnerPath,
      testWorkspace
    })

    /**
     * Use Insiders release for testing
     */
    await runTests({
      version: 'insiders',
      extensionPath,
      testRunnerPath,
      testWorkspace
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
      extensionPath,
      testRunnerPath,
      testWorkspace
    })

    /**
     * - Add additional launch flags for VS Code
     * - Pass custom environment variables to test runner
     */
    await runTests({
      vscodeExecutablePath,
      extensionPath,
      testRunnerPath,
      testWorkspace,
      // This disables all extensions except the one being testing
      additionalLaunchArgs: ['--disable-extensions'],
      // Custom environment variables for test runner
      testRunnerEnv: { foo: 'bar' }
    })

    /**
     * Manually specify all launch flags for VS Code
     */
    await runTests({
      vscodeExecutablePath,
      launchArgs: [
        testWorkspace,
        `--extensionDevelopmentPath=${extensionPath}`,
        `--extensionTestsPath=${testRunnerPath}`
      ]
    })
  } catch (err) {
    console.error('Failed to run tests')
    process.exit(1)
  }
}

go()
