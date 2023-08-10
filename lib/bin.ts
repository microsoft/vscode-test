/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { resolve } from 'path';
import { parseArgs } from 'util';
import { runTests } from './runTest';

const options = {
	'vscode-executable-path': { type: 'string' },
	version: { type: 'string' },
	platform: { type: 'string' },
	'reuse-machine-install': { type: 'boolean' },
	'extension-development-path': { type: 'string', multiple: true },
	'launch-args': { type: 'string', multiple: true },
	'extract-sync': { type: 'boolean' },
	help: { type: 'boolean' },
} as const;

const help = `Usage: code-test [options][extension-tests-path...]

Options
	--vscode-executable-path      The VS Code executable path used for testing.
	--version                     The VS Code version to download.
	--platform                    The VS Code platform to download. If not specified, it defaults to
                                the current platform.
	--reuse-machine-install       Whether VS Code should be launched using default settings and
                                extensions installed on this machine.
	--launch-args                 A list of launch arguments passed to VS Code executable,
	--extract-sync                Whether the downloaded zip should be synchronously extracted.
	--help                        Show this help message.
`;

async function main(): Promise<number> {
	let parsed;
	try {
		parsed = parseArgs({ options, allowPositionals: true });
	} catch {
		console.log(help);
		return 1;
	}

	if (parsed.values.help) {
		console.log(help);
		return 0;
	}

	if (parsed.positionals.length !== 1) {
		console.log(help);
		return 1;
	}

	return runTests({
		vscodeExecutablePath: parsed.values['vscode-executable-path'],
		version: parsed.values.version,
		platform: parsed.values.platform,
		reuseMachineInstall: parsed.values['reuse-machine-install'],
		extensionDevelopmentPath: parsed.values['extension-development-path'] || process.cwd(),
		extensionTestsPath: resolve(process.cwd(), parsed.positionals[0]),
		launchArgs: parsed.values['launch-args'],
		extractSync: parsed.values['extract-sync'],
	});
}

main()
	.catch((error) => {
		console.error(error);
		return 1;
	})
	.then((exitCode) => {
		process.exitCode = exitCode;
	});
