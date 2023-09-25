/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import Mocha from 'mocha';

export async function run() {
	const {
		mochaOpts,
		files,
		preload,
		colorDefault,
	}: {
		mochaOpts: Mocha.MochaOptions;
		files: string[];
		preload: string[];
		colorDefault: boolean;
	} = JSON.parse(process.env.VSCODE_TEST_OPTIONS!);

	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
		color: colorDefault,
		...mochaOpts,
	});

	for (const file of preload) {
		require(file);
	}

	for (const file of files) {
		mocha.addFile(file);
	}

	await new Promise<void>((resolve, reject) =>
		mocha.run((failures) =>
			failures ? reject(failures > 1 ? `${failures} tests failed.` : `${failures} test failed.`) : resolve()
		)
	);
}
