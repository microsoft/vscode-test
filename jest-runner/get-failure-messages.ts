import { AggregatedResult } from '@jest/test-result';

export default (results: AggregatedResult): string[] | undefined => {
	const failures = results.testResults.reduce<string[]>(
		(acc, { failureMessage }) => (failureMessage ? [...acc, failureMessage] : acc),
		[]
	);

	return failures.length > 0 ? failures : undefined;
};
