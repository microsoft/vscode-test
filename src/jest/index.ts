/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import { run as runJest } from 'jest-cli';
import { logger } from './debug-console/logger';

const rootDir = path.resolve(process.cwd(), '../../');

export async function run(): Promise<void> {
	process.stdout.write = (text: string) => !!logger(text);
	process.stderr.write = (text: string) => !!logger(text);

	let args: string[] = [];
	if (process.env.JEST_ARGS) {
		args = JSON.parse(process.env.JEST_ARGS);
	}

	args.push(
		'--runInBand',
		'--env=vscode',
		'--colors',
		'--verbose',
		`--setupFilesAfterEnv=${path.resolve(__dirname, './setup.js')}`
	);

	await runJest(args, rootDir);
}
