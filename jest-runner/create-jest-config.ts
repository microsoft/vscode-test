import * as path from 'path';

export default (rootDir: string, jestRunnerDir: string): any => ({
	rootDir,
	roots: ['<rootDir>/src'],
	verbose: true,
	colors: true,
	transform: JSON.stringify({ '^.+\\.ts$': 'ts-jest' }),
	runInBand: true, // required due to the way the "vscode" module is injected
	testRegex: process.env.JEST_RUNNER_TEST_REGEX || '\\.(test|spec)\\.ts$',
	testEnvironment: 'vscode',
	setupFilesAfterEnv: [process.env.JEST_RUNNER_SETUP || path.resolve(jestRunnerDir, './setup.js')],
	updateSnapshot: process.env.JEST_RUNNER_UPDATE_SNAPSHOTS === 'true',
	globals: JSON.stringify({
		'ts-jest': {
			tsConfig: path.resolve(rootDir, './tsconfig.json')
		}
	})
});
