#!/usr/bin/env node

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* https://github.com/Stuk/eslint-plugin-header/issues/31 */
/* eslint-disable header/header */

import { resolve } from 'path';
import { runTests } from '.';

const run = async () => {
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		printHelp();
		return 0;
	}

	try {
		require.resolve('@jest/core');
	} catch (e) {
		printMissingDependency();
		return 0;
	}

	process.env.JEST_ARGS = JSON.stringify(process.argv.slice(2));

	await runTests({
		extensionDevelopmentPath: process.cwd(),
		extensionTestsPath: resolve(__dirname, 'jest'),
	});

	return 0;
}

const printMissingDependency = () => {
	console.error('You need to install `jest-cli` to use `code-jest`.')
	console.error('');
	console.error('Run `npm install --save-dev jest-cli` or `yarn add --dev jest-cli` to do so.');
};

const printHelp = () => {
	console.error(`code-jest is a command line to run vscode tests with Jest`)
	console.error('');
	console.error('Usage: code-jest [args...]')
	console.error('');
	console.error('Additional arguments will be passed to the Jest command line');
};

if (require.main === module) {
	run()
		.then(code => process.exit(code))
		.catch(e => {
			console.error(e);
			process.exit(1);
		});
}
