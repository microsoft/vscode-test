#!/usr/bin/env node
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chokidar from 'chokidar';
import { existsSync, promises as fs } from 'fs';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { cpus } from 'os';
import { dirname, isAbsolute, join } from 'path';
import * as supportsColor from 'supports-color';
import yargs from 'yargs';
import { runTests } from '../runTest';
import { IDesktopTestConfiguration, TestConfiguration } from './config';

const rulesAndBehavior = 'Mocha: Rules & Behavior';
const reportingAndOutput = 'Mocha: Reporting & Output';
const fileHandling = 'Mocha: File Handling';
const testFilters = 'Mocha: Test Filters';
const vscodeSection = 'VS Code Options';
const configFileDefault = 'nearest .vscode-test.js';

const args = yargs(process.argv)
	.epilogue('See https://code.visualstudio.com/api/working-with-extensions/testing-extension for help')
	.option('config', {
		type: 'string',
		description: 'Config file to use',
		default: configFileDefault,
		group: vscodeSection,
	})
	.option('label', {
		alias: 'l',
		type: 'array',
		description: 'Specify the test configuration to run based on its label in configuration',
		group: vscodeSection,
	})
	//#region Rules & Behavior
	.option('bail', {
		alias: 'b',
		type: 'boolean',
		description: 'Abort ("bail") after first test failure',
		group: rulesAndBehavior,
	})
	.option('dry-run', {
		type: 'boolean',
		description: 'Report tests without executing them',
		group: rulesAndBehavior,
	})
	.option('list-configuration', {
		type: 'boolean',
		description: 'List configurations and that they woud run, without executing them',
		group: rulesAndBehavior,
	})
	.option('fail-zero', {
		type: 'boolean',
		description: 'Fail test run if no test(s) encountered',
		group: rulesAndBehavior,
	})
	.option('forbid-only', {
		type: 'boolean',
		description: 'Fail if exclusive test(s) encountered',
		group: rulesAndBehavior,
	})
	.option('forbid-pending', {
		type: 'boolean',
		description: 'Fail if pending test(s) encountered',
		group: rulesAndBehavior,
	})
	.option('jobs', {
		alias: 'j',
		type: 'number',
		description: 'Number of concurrent jobs for --parallel; use 1 to run in serial',
		default: Math.max(1, cpus().length - 1),
		group: rulesAndBehavior,
	})
	.options('parallel', {
		alias: 'p',
		type: 'boolean',
		description: 'Run tests in parallel',
		group: rulesAndBehavior,
	})
	.option('retries', {
		alias: 'r',
		type: 'number',
		description: 'Number of times to retry failed tests',
		group: rulesAndBehavior,
	})
	.option('slow', {
		alias: 's',
		type: 'number',
		description: 'Specify "slow" test threshold (in milliseconds)',
		default: 75,
		group: rulesAndBehavior,
	})
	.option('timeout', {
		alias: 't',
		type: 'number',
		description: 'Specify test timeout threshold (in milliseconds)',
		default: 2000,
		group: rulesAndBehavior,
	})
	//#endregion
	//#region Reporting & Output
	.option('color', {
		alias: 'c',
		type: 'boolean',
		description: 'Force-enable color output',
		group: reportingAndOutput,
	})
	.option('diff', {
		type: 'boolean',
		description: 'Show diff on failure',
		default: true,
		group: reportingAndOutput,
	})
	.option('full-trace', {
		type: 'boolean',
		description: 'Display full stack traces',
		group: reportingAndOutput,
	})
	.option('inline-diffs', {
		type: 'boolean',
		description: 'Display actual/expected differences inline within each string',
		group: reportingAndOutput,
	})
	.option('reporter', {
		alias: 'R',
		type: 'string',
		description: 'Specify reporter to use',
		default: 'spec',
		group: reportingAndOutput,
	})
	.option('reporter-option', {
		alias: 'O',
		type: 'array',
		description: 'Reporter-specific options (<k=v,[k1=v1,..]>)',
		group: reportingAndOutput,
	})
	//#endregion
	//#region File Handling
	.option('file', {
		type: 'array',
		description: 'Specify file(s) to be loaded prior to root suite',
		group: fileHandling,
	})
	.option('ignore', {
		alias: 'exclude',
		type: 'array',
		description: 'Ignore file(s) or glob pattern(s)',
		group: fileHandling,
	})
	.option('watch', {
		alias: 'w',
		type: 'boolean',
		description: 'Watch files in the current working directory for changes',
		group: fileHandling,
	})
	.option('watch-files', {
		type: 'array',
		description: 'List of paths or globs to watch',
		group: fileHandling,
	})
	.option('watch-ignore', {
		type: 'array',
		description: 'List of paths or globs to exclude from watching',
		group: fileHandling,
	})
	//#endregion
	//#region Test Filters
	.option('fgrep', {
		type: 'string',
		alias: 'f',
		description: 'Only run tests containing this string',
		group: testFilters,
	})
	.option('grep', {
		type: 'string',
		alias: 'g',
		description: 'Only run tests matching this string or regexp',
		group: testFilters,
	})
	.option('invert', {
		alias: 'i',
		type: 'boolean',
		description: 'Inverts --grep and --fgrep matches',
		group: testFilters,
	})
	.parseSync();

// Avoid TS rewriting async import into a require:
type ConfigOrArray = TestConfiguration | TestConfiguration[];

const configFileRules: { [ext: string]: (path: string) => Promise<ConfigOrArray | Promise<ConfigOrArray>> } = {
	json: (path: string) => fs.readFile(path, 'utf8').then(JSON.parse),
	js: (path) => require(path),
	mjs: (path) => import(path),
};

interface IConfigWithPath {
	config: TestConfiguration;
	path: string;
}

class CliExpectedError extends Error {}

main();

async function main() {
	let code = 0;

	try {
		let configs =
			args.config !== configFileDefault ? await tryLoadConfigFile(args.config) : await loadDefaultConfigFile();

		if (args.label?.length) {
			configs = args.label.map((label) => {
				const found = configs.find((c, i) => (typeof label === 'string' ? c.config.label === label : i === label));
				if (!found) {
					throw new CliExpectedError(`Could not find a configuration with label "${label}"`);
				}
				return found;
			});
		}

		if (args.watch) {
			await watchConfigs(configs);
		} else {
			code = await runConfigs(configs);
		}
	} catch (e) {
		code = 1;
		if (e instanceof CliExpectedError) {
			console.error(e.message);
		} else {
			console.error((e as Error).stack || e);
		}
	} finally {
		process.exit(code);
	}
}

const WATCH_RUN_DEBOUNCE = 500;

async function watchConfigs(configs: readonly IConfigWithPath[]) {
	let debounceRun: NodeJS.Timer;
	let rerun = false;
	let running = true;
	const runOrDebounce = () => {
		if (debounceRun) {
			clearTimeout(debounceRun);
		}

		debounceRun = setTimeout(async () => {
			running = true;
			rerun = false;
			try {
				await runConfigs(configs);
			} finally {
				running = false;
				if (rerun) {
					runOrDebounce();
				}
			}
		}, WATCH_RUN_DEBOUNCE);
	};

	const watcher = chokidar.watch(args.watchFiles?.length ? args.watchFiles.map(String) : process.cwd(), {
		ignored: ['**/.vscode-test/**', '**/node_modules/**', ...(args.watchIgnore || []).map(String)],
		ignoreInitial: true,
	});

	watcher.on('all', (evts) => {
		console.log(evts);
		if (running) {
			rerun = true;
		} else {
			runOrDebounce();
		}
	});

	watcher.on('ready', () => {
		runOrDebounce();
	});

	// wait until interrupted
	await new Promise(() => {
		/* no-op */
	});
}

const isDesktop = (config: TestConfiguration): config is IDesktopTestConfiguration =>
	!config.platform || config.platform === 'desktop';

const RUNNER_PATH = join(__dirname, 'runner.js');

/** Runs the given test configurations. */
async function runConfigs(configs: readonly IConfigWithPath[]) {
	const resolvedConfigs = await Promise.all(
		configs.map(async (c) => {
			const files = await gatherFiles(c);
			const env: Record<string, string> = {};
			if (isDesktop(c.config)) {
				c.config.launchArgs ||= [];
				if (c.config.workspaceFolder) {
					c.config.launchArgs.push(c.config.workspaceFolder);
				}
				env.VSCODE_TEST_OPTIONS = JSON.stringify({
					mochaOpts: { ...args, ...c.config.mocha },
					colorDefault: supportsColor.stdout || process.env.MOCHA_COLORS !== undefined,
					preload: [
						...(typeof c.config.mocha?.preload === 'string'
							? [c.config.mocha.preload]
							: c.config.mocha?.preload || []
						).map((f) => require.resolve(f, { paths: [c.path] })),
						...(args.file?.map((f) => require.resolve(String(f), { paths: [process.cwd()] })) || []),
					],
					files,
				});
			}
			return { ...c, files, env, extensionTestsPath: RUNNER_PATH };
		})
	);
	if (args.listConfiguration) {
		console.log(JSON.stringify(resolvedConfigs, null, 2));
		process.exit(0);
	}

	let code = 0;
	for (const { config, path, env, extensionTestsPath } of resolvedConfigs) {
		if (isDesktop(config)) {
			const nextCode = await runTests({
				extensionDevelopmentPath: config.extensionDevelopmentPath || dirname(path),
				extensionTestsPath,
				extensionTestsEnv: { ...config.env, ...env },
				launchArgs: [...(config.launchArgs || [])],
				platform: config.desktopPlatform,
				reporter: config.download?.reporter,
				timeout: config.download?.timeout,
				reuseMachineInstall:
					config.useInstallation && 'fromMachine' in config.useInstallation
						? config.useInstallation.fromMachine
						: undefined,
				vscodeExecutablePath:
					config.useInstallation && 'fromPath' in config.useInstallation ? config.useInstallation.fromPath : undefined,
			});

			if (nextCode > 0 && args.bail) {
				return nextCode;
			}

			code = Math.max(code, nextCode);
		}
	}

	return code;
}

/** Gathers test files that match the config */
async function gatherFiles({ config, path }: IConfigWithPath) {
	const fileListsProms: (string[] | Promise<string[]>)[] = [];
	const cwd = dirname(path);
	const ignoreGlobs = args.ignore?.map(String).filter((p) => !isAbsolute(p));
	for (const file of config.files instanceof Array ? config.files : [config.files]) {
		if (isAbsolute(file)) {
			if (!ignoreGlobs?.some((i) => minimatch(file, i))) {
				fileListsProms.push([file]);
			}
		} else {
			fileListsProms.push(glob(file, { cwd, ignore: ignoreGlobs }).then((l) => l.map((f) => join(cwd, f))));
		}
	}

	const files = new Set((await Promise.all(fileListsProms)).flat());
	args.ignore?.forEach((i) => (files as Set<string | number>).delete(i));
	return [...files];
}

/** Loads a specific config file by the path, throwing if loading fails. */
async function tryLoadConfigFile(path: string) {
	const ext = path.split('.').pop()!;
	if (!configFileRules.hasOwnProperty(ext)) {
		throw new CliExpectedError(
			`I don't know how to load the extension '${ext}'. We can load: ${Object.keys(configFileRules).join(', ')}`
		);
	}

	try {
		let loaded = await configFileRules[ext](path);
		if ('default' in loaded) {
			// handle default es module exports
			loaded = (loaded as { default: TestConfiguration }).default;
		}
		// allow returned promises to resolve:
		loaded = await loaded;

		return (Array.isArray(loaded) ? loaded : [loaded]).map((config) => ({ config, path }));
	} catch (e) {
		throw new CliExpectedError(`Could not read config file ${path}: ${(e as Error).stack || e}`);
	}
}

/** Loads the default config based on the process working directory. */
async function loadDefaultConfigFile() {
	const base = '.vscode-test';

	let dir = process.cwd();
	while (true) {
		for (const ext of Object.keys(configFileRules)) {
			const candidate = join(dir, `${base}.${ext}`);
			if (existsSync(candidate)) {
				return tryLoadConfigFile(candidate);
			}
		}

		const next = dirname(dir);
		if (next === dir) {
			break;
		}

		dir = next;
	}

	throw new CliExpectedError(
		`Could not find a ${base} file in this directory or any parent. You can specify one with the --config option.`
	);
}
