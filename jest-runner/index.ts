import * as path from 'path';
import { runCLI } from '@jest/core';
import { logger } from './debug-console/logger';
import createJestConfig from './create-jest-config';
import getFailureMessages from './get-failure-messages';

const rootDir = path.resolve(__dirname, '../../../../');
const jestRunnerDir = __dirname;

export async function run(_testRoot: string, callback: (error: Error | null, failures?: any) => void): Promise<void> {
	process.stdout.write = logger as any;
	process.stderr.write = logger as any;

	try {
		const { results } = await (runCLI as any)(createJestConfig(rootDir, jestRunnerDir), [rootDir]);
		callback(null, getFailureMessages(results));
	} catch (error) {
		callback(error);
	}
}
