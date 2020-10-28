import { logger } from './logger';

test('returns text without no formatting', () => {
	expect(logger('text with no formatting')).toMatchInlineSnapshot(`"text with no formatting"`);
});

test('returns passing test header', () => {
	expect(logger('PASS src/path/to/file.ts')).toMatchInlineSnapshot(`"[1m[42m[30m PASS [0m[0m[0m [90msrc/path/to/[0m[1mfile.ts[0m"`);
});

test('returns failing test header', () => {
	expect(logger('FAIL src/path/to/file.ts')).toMatchInlineSnapshot(`"[1m[41m[30m FAIL [0m[0m[0m [90msrc/path/to/[0m[1mfile.ts[0m"`);
});

test('returns passing test description', () => {
	expect(logger('✓ description of test')).toMatchInlineSnapshot(`"  [32m✓[0m [90mdescription of test[0m"`);
});

test('returns failing test description', () => {
	expect(logger('✕ description of test')).toMatchInlineSnapshot(`"  [31m✕[0m [90mdescription of test[0m"`);
});

test('returns skipped test description', () => {
	expect(logger('○ description of test')).toMatchInlineSnapshot(`"  [33m○[0m [90mdescription of test[0m"`);
});

test('returns todo test description', () => {
	expect(logger('✎ description of test')).toMatchInlineSnapshot(`"  [35m✎[0m [90mdescription of test[0m"`);
});

test('returns test failure message', () => {
	expect(logger('● test failure message')).toMatchInlineSnapshot(`"[31m● test failure message[0m"`);
});

test('returns test summary', () => {
	expect(
		logger(
			`Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 1 passed, 1 skipped, 1 todo, 4 total
Snapshots:   1 failed, 1 written, 1 updated, 1 passed, 1 obsolete, 1 removed, 1 file removed, 7 total
Snapshots:   1 failed, 1 written, 1 updated, 1 passed, 1 obsolete, 1 removed, 2 files removed, 8 total
Time:        5.000s
Ran all test suites.`
		)
	).toMatchInlineSnapshot(`
"[1mTest Suites:[0m [1m[31m1 failed[0m[0m, [1m[32m1 passed[0m[0m, 2 total
[1mTests:[0m       [1m[31m1 failed[0m[0m, [1m[32m1 passed[0m[0m, [1m[33m1 skipped[0m[0m, [1m[35m1 todo[0m[0m, 4 total
[1mSnapshots:[0m   [1m[31m1 failed[0m[0m, [1m[32m1 written[0m[0m, [1m[32m1 updated[0m[0m, [1m[32m1 passed[0m[0m, [1m[33m1 obsolete[0m[0m, [1m[32m1 removed[0m[0m, [1m[32m1 file removed[0m[0m, 7 total
[1mSnapshots:[0m   [1m[31m1 failed[0m[0m, [1m[32m1 written[0m[0m, [1m[32m1 updated[0m[0m, [1m[32m1 passed[0m[0m, [1m[33m1 obsolete[0m[0m, [1m[32m1 removed[0m[0m, [1m[32m2 files removed[0m[0m, 8 total
[1mTime:[0m        5.000s
[90mRan all test suites.[0m"
`);
});

test('returns updated snapshot message', () => {
	expect(logger(' › 1 snapshot updated.')).toMatchInlineSnapshot(`"[1m[32m › 1 snapshot updated.[0m[0m"`);
});

test('returns written snapshot message', () => {
	expect(logger(' › 1 snapshot written.')).toMatchInlineSnapshot(`"[1m[32m › 1 snapshot written.[0m[0m"`);
});

test('returns file removed snapshot message', () => {
	expect(logger(' › snapshot file removed.')).toMatchInlineSnapshot(`"[1m[32m › snapshot file removed.[0m[0m"`);
});

test('returns removed snapshot message', () => {
	expect(logger(' › 1 snapshot removed.')).toMatchInlineSnapshot(`"[1m[32m › 1 snapshot removed.[0m[0m"`);
});

test('returns obsolete snapshot message', () => {
	expect(logger(' › 1 snapshot obsolete.')).toMatchInlineSnapshot(`"[1m[33m › 1 snapshot obsolete.[0m[0m"`);
});

test('returns failed snapshot message', () => {
	expect(logger(' › 1 snapshot failed.')).toMatchInlineSnapshot(`"[1m[31m › 1 snapshot failed.[0m[0m"`);
});

test('returns snapshot summary message', () => {
	expect(logger('Snapshot Summary')).toMatchInlineSnapshot(`"[1mSnapshot Summary[0m"`);
});

test('returns written snapshot summary (sigular)', () => {
	expect(logger(' › 1 snapshot written from 1 test suite.')).toMatchInlineSnapshot(
		`" [1m[32m› 1 snapshot written[0m[0m from 1 test suite."`
	);
});

test('returns written snapshot summary (plural)', () => {
	expect(logger(' › 2 snapshots written from 2 test suites.')).toMatchInlineSnapshot(
		`" [1m[32m› 2 snapshots written[0m[0m from 2 test suites."`
	);
});

test('returns updated snapshot summary (sigular)', () => {
	expect(logger(' › 1 snapshot updated from 1 test suite.')).toMatchInlineSnapshot(
		`" [1m[32m› 1 snapshot updated[0m[0m from 1 test suite."`
	);
});

test('returns updated snapshot summary (plural)', () => {
	expect(logger(' › 2 snapshots updated from 2 test suites.')).toMatchInlineSnapshot(
		`" [1m[32m› 2 snapshots updated[0m[0m from 2 test suites."`
	);
});

test('returns file removed snapshot summary (sigular)', () => {
	expect(logger(' › 1 snapshot file removed from 1 test suite.')).toMatchInlineSnapshot(
		`" [1m[32m› 1 snapshot file removed[0m[0m from 1 test suite."`
	);
});

test('returns files removed snapshot summary (plural)', () => {
	expect(logger(' › 2 snapshot files removed from 2 test suites.')).toMatchInlineSnapshot(
		`" [1m[32m› 2 snapshot files removed[0m[0m from 2 test suites."`
	);
});

test('returns removed snapshot summary (sigular)', () => {
	expect(logger(' › 1 snapshot removed from 1 test suite.')).toMatchInlineSnapshot(
		`" [1m[32m› 1 snapshot removed[0m[0m from 1 test suite."`
	);
});

test('returns removed snapshot summary (plural)', () => {
	expect(logger(' › 2 snapshots removed from 2 test suites.')).toMatchInlineSnapshot(
		`" [1m[32m› 2 snapshots removed[0m[0m from 2 test suites."`
	);
});

test('returns obsolete snapshot summary (sigular)', () => {
	expect(
		logger(' › 1 snapshot obsolete from 1 test suite. To remove it, re-run jest with `-u`.')
	).toMatchInlineSnapshot(
		`" [1m[33m› 1 snapshot obsolete[0m[0m from 1 test suite. [90mTo remove them all, re-run jest with \`JEST_RUNNER_UPDATE_SNAPSHOTS=true\`.[0m"`
	);
});

test('returns obsolete snapshot summary (plural)', () => {
	expect(
		logger(' › 2 snapshots obsolete from 2 test suites. To remove it, re-run jest with `-u`.')
	).toMatchInlineSnapshot(
		`" [1m[33m› 2 snapshots obsolete[0m[0m from 2 test suites. [90mTo remove them all, re-run jest with \`JEST_RUNNER_UPDATE_SNAPSHOTS=true\`.[0m"`
	);
});

test('returns obsolete test path', () => {
	expect(logger('   ↳ src/path/to/file.test.ts')).toMatchInlineSnapshot(`"   ↳ [90msrc/path/to/[0m[1mfile.test.ts[0m"`);
});

test('returns failed snapshot summary (sigular)', () => {
	expect(
		logger(' › 1 snapshot failed from 1 test suite. Inspect your code changes or run `yarn test -u` to update them.')
	).toMatchInlineSnapshot(
		`" [1m[31m› 1 snapshot failed[0m[0m from 1 test suite. [90mInspect your code changes or re-run jest with \`JEST_RUNNER_UPDATE_SNAPSHOTS=true\` to update them.[0m"`
	);
});

test('returns failed snapshot summary (plural)', () => {
	expect(
		logger(' › 2 snapshots failed from 2 test suites. Inspect your code changes or run `yarn test -u` to update them.')
	).toMatchInlineSnapshot(
		`" [1m[31m› 2 snapshots failed[0m[0m from 2 test suites. [90mInspect your code changes or re-run jest with \`JEST_RUNNER_UPDATE_SNAPSHOTS=true\` to update them.[0m"`
	);
});
