import { AggregatedResult, TestResult } from '@jest/test-result';
import getFailureMessages from './get-failure-messages';

const createTestResult = (failureMessage?: string): TestResult => ({
	leaks: false,
	numFailingTests: 0,
	numPassingTests: 0,
	numPendingTests: 0,
	numTodoTests: 0,
	openHandles: [],
	perfStats: {
		start: 0,
		end: 0
	},
	skipped: false,
	snapshot: {
		added: 0,
		fileDeleted: false,
		matched: 0,
		unchecked: 0,
		uncheckedKeys: [],
		unmatched: 0,
		updated: 0
	},
	testFilePath: '',
	testResults: [],
	failureMessage
});

const createAggregatedResult = (failureMessages: string[] = []): AggregatedResult => ({
	numFailedTests: 0,
	numFailedTestSuites: 0,
	numPassedTests: 0,
	numPassedTestSuites: 0,
	numPendingTests: 0,
	numPendingTestSuites: 0,
	numTodoTests: 0,
	numRuntimeErrorTestSuites: 0,
	numTotalTests: 0,
	numTotalTestSuites: 0,
	openHandles: [],
	snapshot: {
		added: 0,
		didUpdate: false,
		failure: false,
		filesAdded: 0,
		filesRemoved: 0,
		filesRemovedList: [],
		filesUnmatched: 0,
		filesUpdated: 0,
		matched: 0,
		total: 0,
		unchecked: 0,
		uncheckedKeysByFile: [],
		unmatched: 0,
		updated: 0
	},
	startTime: 0,
	success: true,
	testResults: [createTestResult(), ...failureMessages.map(message => createTestResult(message)), createTestResult()],
	wasInterrupted: false
});

test('returns undefined when there are no failures', () => {
	expect(getFailureMessages(createAggregatedResult())).toMatchInlineSnapshot(`undefined`);
});

test('returns the list of failures', () => {
	expect(getFailureMessages(createAggregatedResult(['test failure 1', 'test failure 2']))).toMatchInlineSnapshot(`
    Array [
      "test failure 1",
      "test failure 2",
    ]
  `);
});
