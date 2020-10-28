import createJestConfig from './create-jest-config';

const rootDir = './rootDir';
const jestRunnerDir = './rootDir/node_modules/vscode-test/out/jest-runner';

test('creates default jest config', () => {
	const jestConfig = createJestConfig(rootDir, jestRunnerDir);
	expect(jestConfig.testRegex).toBe('\\.(test|spec)\\.ts$');
	expect(jestConfig.setupFilesAfterEnv[0]).toMatch(/jest-runner[\\\/]+setup\.js$/);
	expect(jestConfig.updateSnapshot).toBe(false);
	expect(jestConfig.globals).toMatch(/rootDir[\\\/]+tsconfig\.json/);
});

test('creates jest config with custom setup file', () => {
	process.env.JEST_RUNNER_SETUP = '/path/to/custom/setup/vscode-jest-test-runner-setup.js';
	expect(createJestConfig(rootDir, jestRunnerDir).setupFilesAfterEnv).toContain(
		'/path/to/custom/setup/vscode-jest-test-runner-setup.js'
	);
	delete process.env.JEST_RUNNER_SETUP;
});

test('creates jest config with custom test regex', () => {
	process.env.JEST_RUNNER_TEST_REGEX = '/path/to/single/test/file.ts';
	expect(createJestConfig(rootDir, jestRunnerDir).testRegex).toBe('/path/to/single/test/file.ts');
	delete process.env.JEST_RUNNER_TEST_REGEX;
});

test('creates jest config with update snapshot', () => {
	process.env.JEST_RUNNER_UPDATE_SNAPSHOTS = 'true';
	expect(createJestConfig(rootDir, jestRunnerDir).updateSnapshot).toBe(true);
	delete process.env.JEST_RUNNER_UPDATE_SNAPSHOTS;
});
