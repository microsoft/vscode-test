<p>
  <h1 align="center">vscode-test-jest-runner</h1>
</p>

Run VS Code tests using Jest Testing Framework

## Table of contents

- [Installation](#installation)
- [Setup](#setup)
- [Environment variables](#environment-variables)

## Installation

### npm

```sh
npm install vscode-test jest --save-dev
```

### yarn

```sh
yarn add vscode-test jest --dev
```

## Setup

### Example `launch.json`

```json
{
	"version": "0.2.0",
	"configurations": [
		{
			"name": "Jest: Extension Tests",
			"type": "extensionHost",
			"request": "launch",
			"runtimeExecutable": "${execPath}",
			"args": [
				"--disable-extensions",
				"--extensionDevelopmentPath=${workspaceFolder}",
				"--extensionTestsPath=${workspaceFolder}/node_modules/vscode-test/out/jest-runner"
			],
			"outFiles": ["${workspaceFolder}/dist/**/*.js"],
			"preLaunchTask": "npm: compile",
			"internalConsoleOptions": "openOnSessionStart",
			"env": {
				"JEST_RUNNER_TEST_REGEX": "",
				"JEST_RUNNER_UPDATE_SNAPSHOTS": "false"
			}
		},
		{
			"name": "Jest: Current Test File",
			"type": "extensionHost",
			"request": "launch",
			"runtimeExecutable": "${execPath}",
			"args": [
				"--disable-extensions",
				"--extensionDevelopmentPath=${workspaceFolder}",
				"--extensionTestsPath=${workspaceFolder}/node_modules/vscode-test/out/jest-runner"
			],
			"outFiles": ["${workspaceFolder}/dist/**/*.js"],
			"preLaunchTask": "npm: compile",
			"internalConsoleOptions": "openOnSessionStart",
			"env": {
				"JEST_RUNNER_TEST_REGEX": "${file}",
				"JEST_RUNNER_UPDATE_SNAPSHOTS": "false"
			}
		},
		{
			"name": "Jest: Update All Snapshots",
			"type": "extensionHost",
			"request": "launch",
			"runtimeExecutable": "${execPath}",
			"args": [
				"--disable-extensions",
				"--extensionDevelopmentPath=${workspaceFolder}",
				"--extensionTestsPath=${workspaceFolder}/node_modules/vscode-test/out/jest-runner"
			],
			"outFiles": ["${workspaceFolder}/dist/**/*.js"],
			"preLaunchTask": "npm: compile",
			"internalConsoleOptions": "openOnSessionStart",
			"env": {
				"JEST_RUNNER_TEST_REGEX": "",
				"JEST_RUNNER_UPDATE_SNAPSHOTS": "true"
			}
		},
		{
			"name": "Jest: Update Snapshots in Current Test File",
			"type": "extensionHost",
			"request": "launch",
			"runtimeExecutable": "${execPath}",
			"args": [
				"--disable-extensions",
				"--extensionDevelopmentPath=${workspaceFolder}",
				"--extensionTestsPath=${workspaceFolder}/node_modules/vscode-test/out/jest-runner"
			],
			"outFiles": ["${workspaceFolder}/dist/**/*.js"],
			"preLaunchTask": "npm: compile",
			"internalConsoleOptions": "openOnSessionStart",
			"env": {
				"JEST_RUNNER_TEST_REGEX": "${file}",
				"JEST_RUNNER_UPDATE_SNAPSHOTS": "true"
			}
		}
	]
}
```

## Environment variables

### `JEST_RUNNER_TEST_REGEX`

The pattern Jest uses to detect test files.

> **Example `env` settings:**
>
> ```json
> "env": {
>   "JEST_RUNNER_TEST_REGEX": "${file}",
> }
> ```

### `JEST_RUNNER_UPDATE_SNAPSHOTS`

Use this to re-record every snapshot that fails during this test run. Can be used together with `JEST_RUNNER_TEST_REGEX` to re-record snapshots.

> **Example `env` settings:**
>
> ```json
> "env": {
>   "JEST_RUNNER_UPDATE_SNAPSHOTS": "true",
> }
> ```

### `JEST_RUNNER_SETUP`

The path to a module that runs some code to configure or set up the testing framework before each test. You can use this to mock VS Code APIs, such as forcing the `getConfiguration` API to use an in-memory cache vs. interacting with the file system (see `jest-runner-setup.ts` example below).

> **Example `env` settings:**
>
> ```json
> "env": {
>   "JEST_RUNNER_SETUP": "${workspaceFolder}/dist/test-utils/jest-runner-setup.js",
> }
> ```
>
> **`jest-runner-setup.ts`**
>
> ```ts
> process.env.NODE_ENV = 'test';
>
> jest.mock(
> 	'vscode',
> 	() => {
> 		const { vscode } = global as any;
>
> 		vscode.workspace.getConfiguration = (section: string) => {
> 			let config: WorkspaceConfig = { ...workspaceConfig };
> 			for (const sectionKey of section.split('.')) {
> 				config = config[sectionKey];
> 			}
>
> 			function get<T>(section: string, defaultValue: T): T;
> 			function get<T>(section: string): T | undefined {
> 				return config[section];
> 			}
>
> 			return {
> 				...config,
> 				get,
> 				update: update(section),
> 			};
> 		};
>
> 		return vscode;
> 	},
> 	{ virtual: true }
> );
>
> interface WorkspaceConfig {
> 	[name: string]: any;
> }
>
> let workspaceConfig = defaultConfig();
> afterEach(() => {
> 	workspaceConfig = defaultConfig();
> });
>
> function update(rootSection: string): (section: string, value: any) => void {
> 	return (section: string, value: any) => {
> 		let config: any = workspaceConfig;
> 		for (const sectionKey of rootSection.split('.')) {
> 			config = config[sectionKey];
> 		}
>
> 		config[section] = value;
> 	};
> }
>
> function defaultConfig(): WorkspaceConfig {
> 	return {
> 		workbench: {
> 			colorTheme: 'Default Dark+',
> 		},
> 	};
> }
> ```
