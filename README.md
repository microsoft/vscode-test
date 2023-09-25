# vscode-test

![Test Status Badge](https://github.com/microsoft/vscode-test/workflows/Tests/badge.svg)

This module helps you test VS Code extensions.

Supported:

- Node >= 16.x
- Windows >= Windows Server 2012+ / Win10+ (anything with Powershell >= 5.0)
- macOS
- Linux

## Usage

See [./sample](./sample) for a runnable sample, with [Azure DevOps Pipelines](https://github.com/microsoft/vscode-test/blob/master/sample/azure-pipelines.yml) and [Travis CI](https://github.com/microsoft/vscode-test/blob/master/.travis.yml) configuration.

```ts
import { runTests } from '@vscode/test-electron';

async function go() {
	try {
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
		const testWorkspace = path.resolve(__dirname, '../../../test-fixtures/fixture1');

		/**
		 * Running another test suite on a specific workspace
		 */
		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath: extensionTestsPath2,
			launchArgs: [testWorkspace],
		});

		/**
		 * Use 1.36.1 release for testing
		 */
		await runTests({
			version: '1.36.1',
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
		 * Noop, since 1.36.1 already downloaded to .vscode-test/vscode-1.36.1
		 */
		await downloadAndUnzipVSCode('1.36.1');

		/**
		 * Manually download VS Code 1.35.0 release for testing.
		 */
		const vscodeExecutablePath = await downloadAndUnzipVSCode('1.35.0');
		await runTests({
			vscodeExecutablePath,
			extensionDevelopmentPath,
			extensionTestsPath,
			launchArgs: [testWorkspace],
		});

		/**
		 * Install Python extension
		 */
		const [cli, ...args] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
		cp.spawnSync(cli, [...args, '--install-extension', 'ms-python.python'], {
			encoding: 'utf-8',
			stdio: 'inherit',
		});

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
				// This disables all extensions except the one being tested
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
	} catch (err) {
		console.error('Failed to run tests');
		process.exit(1);
	}
}

go();
```

### Command-Line Runner

> A new experimental command-line test runner is available. Its API _may_ change as we get feedback on it. Please try it out!

After installing the package, the runner is available as the `vscode-test` CLI. Running it will look for a `.vscode-test.(js/json/mjs)` file relative to the current working directory. You can see the configuration [here](https://github.com/microsoft/vscode-test/blob/main/lib/cli-runner/config.ts). This may be as simple as:

```js
// .vscode-test.js
module.exports = { files: 'out/test/**/*.test.js' };
```

Or include more options. For example:

```js
// .vscode-test.js

module.exports = [
	{
		// Required: Glob of files to load (can be an array and include absolute paths).
		files: 'out/test/**/*.test.js',
		// Optional: Version to use, same as the API above, defaults to stable
		version: 'insiders',
		// Optional: Root path of your extension, same as the API above, defaults
		// to the directory this config file is in
		extensionDevelopmentPath: __dirname,
		// Optional: sample workspace to open
		workspaceFolder: `${__dirname}/sampleWorkspace`,
		// Optional: additional mocha options to use:
		mocha: {
			preload: `./out/test-utils.js`,
			timeout: 20000,
		},
	},
	// you can specify additional test configurations if necessary
];
```

Tests included with this command line are run in Mocha. You can run the tests simply by running `vscode-test` on the command line. You can view more options with `vscode-test --help`; this command line is very similar to Mocha. For example, to watch and run only tests named "addition", you can run:

```
vscode-test --watch out/**/*.js --grep "addition"
```

#### Debugging

Add or update an `extensionHost` launch-type config with the path to your test configuration:

```diff
{
	"type": "extensionHost",
	"request": "launch",
	"name": "My extension tests",
+	"testConfiguration": "${workspaceFolder}/.vscode-test.js",
	"args": ["--extensionDevelopmentPath=${workspaceFolder}"]
},
```

## Development

- `yarn install`
- Make necessary changes in [`lib`](./lib)
- `yarn compile` (or `yarn watch`)
- In [`sample`](./sample), run `yarn install`, `yarn compile` and `yarn test` to make sure integration test can run successfully

## License

[MIT](LICENSE)

## Contributing

This project welcomes contributions and suggestions. Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
