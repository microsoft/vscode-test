/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bold, black, green, purple, red, yellow, darkGray, greenBg, redBg } from './colorize';

export function logger(text: string): string | boolean {
	text = text.replace(/\n$/, '');

	let message = formatTestHeader(text);

	if (!message) {
		message = formatTestDescription(text);
	}

	if (!message) {
		message = formatTestError(text);
	}

	if (!message) {
		message = formatSnapshotMessage(text);
	}

	if (!message) {
		message = formatTestSummary(text);
	}

	if (process.env.NODE_ENV === 'test') {
		return message || text;
	}

	console.log(message || text);
	return true;
}

function formatTestHeader(text: string): string {
	const filepath = text.replace(/^(PASS|FAIL)/, '').trim();
	const [testFilename, ...testPathParts] = filepath.split('/').reverse();
	const testPath = testPathParts.reverse().join('/');

	if (text.startsWith('PASS')) {
		return `${bold(greenBg(black(' PASS ')))} ${darkGray(`${testPath}/`)}${bold(testFilename)}`;
	}

	if (text.startsWith('FAIL')) {
		return `${bold(redBg(black(' FAIL ')))} ${darkGray(`${testPath}/`)}${bold(testFilename)}`;
	}

	return '';
}

function formatTestDescription(text: string): string {
	if (text.includes('✓')) {
		return `  ${green('✓')} ${darkGray(text.replace(/✓/, '').trim())}`;
	}

	if (text.includes('✕')) {
		return `  ${red('✕')} ${darkGray(text.replace(/✕/, '').trim())}`;
	}

	if (text.includes('○')) {
		return `  ${yellow('○')} ${darkGray(text.replace(/○/, '').trim())}`;
	}

	if (text.includes('✎')) {
		return `  ${purple('✎')} ${darkGray(text.replace(/✎/, '').trim())}`;
	}

	return '';
}

function formatTestError(text: string): string {
	return text.includes('●') ? red(text) : '';
}

function formatSnapshotMessage(text: string): string {
	if (text.endsWith('updated.') || text.endsWith('written.') || text.endsWith('removed.')) {
		return bold(green(text));
	}

	if (text.endsWith('obsolete.')) {
		return bold(yellow(text));
	}

	if (text.endsWith('failed.')) {
		return bold(red(text));
	}

	if (text === 'Snapshot Summary') {
		return bold(text);
	}

	if (text.includes('written from')) {
		return formatSnapshotSummary(text, 'written', green);
	}

	if (text.includes('updated from')) {
		return formatSnapshotSummary(text, 'updated', green);
	}

	if (text.includes('removed from')) {
		// Use custom messaging for removed snapshot files
		if (text.includes('file')) {
			const [numSnapshots, numTestSuites] = /(\d)+/.exec(text)!;
			return ` ${bold(
				green(`› ${numSnapshots} snapshot ${Number(numSnapshots) > 1 ? 'files' : 'file'} removed`)
			)} from ${numTestSuites} ${Number(numTestSuites) > 1 ? 'test suites' : 'test suite'}.`;
		}

		return formatSnapshotSummary(text, 'removed', green);
	}

	if (text.includes('obsolete from')) {
		return `${formatSnapshotSummary(text, 'obsolete', yellow)} ${darkGray(
			'To remove them all, re-run jest with `JEST_RUNNER_UPDATE_SNAPSHOTS=true`.'
		)}`;
	}

	if (text.includes('↳')) {
		const filepath = text.replace(/↳/, '').trim();
		const [testFilename, ...testPathParts] = filepath.split('/').reverse();
		const testPath = testPathParts.reverse().join('/');
		return `   ↳ ${darkGray(`${testPath}/`)}${bold(testFilename)}`;
	}

	if (text.includes('failed from')) {
		return `${formatSnapshotSummary(text, 'failed', red)} ${darkGray(
			'Inspect your code changes or re-run jest with `JEST_RUNNER_UPDATE_SNAPSHOTS=true` to update them.'
		)}`;
	}

	return '';
}

function formatSnapshotSummary(
	text: string,
	status: 'written' | 'updated' | 'failed' | 'removed' | 'obsolete',
	colorFunc: (text: string) => string
): string {
	const [numSnapshots, numTestSuites] = /(\d)+/.exec(text)!;
	return ` ${bold(
		colorFunc(`› ${numSnapshots} ${Number(numSnapshots) > 1 ? 'snapshots' : 'snapshot'} ${status}`)
	)} from ${numTestSuites} ${Number(numTestSuites) > 1 ? 'test suites' : 'test suite'}.`;
}

function formatTestSummary(text: string): string {
	if (!text.includes('\n')) {
		return '';
	}

	const summary = [];

	for (let line of text.split('\n')) {
		if (line.includes('Ran all test suites.')) {
			summary.push(darkGray(line));
			continue;
		}

		if (line.includes('Test Suites:')) {
			line = line.replace('Test Suites:', bold('Test Suites:'));
		}

		if (line.includes('Tests:')) {
			line = line.replace('Tests:', bold('Tests:'));
		}

		if (line.includes('Snapshots:')) {
			line = line.replace('Snapshots:', bold('Snapshots:'));
		}

		if (line.includes('Time:')) {
			line = line.replace('Time:', bold('Time:'));
		}

		if (line.includes('passed')) {
			line = line.replace(/(?<num>\d+) passed/, bold(green('$<num> passed')));
		}

		if (line.includes('updated')) {
			line = line.replace(/(?<num>\d+) updated/, bold(green('$<num> updated')));
		}

		if (line.includes('written')) {
			line = line.replace(/(?<num>\d+) written/, bold(green('$<num> written')));
		}

		if (line.includes('removed')) {
			// Use custom messaging for removed snapshot files
			line = line.replace(/(?<num>\d+) (?<fileText>file|files) removed/, bold(green('$<num> $<fileText> removed')));
			line = line.replace(/(?<num>\d+) removed/, bold(green('$<num> removed')));
		}

		if (line.includes('todo')) {
			line = line.replace(/(?<num>\d+) todo/, bold(purple('$<num> todo')));
		}

		if (line.includes('skipped')) {
			line = line.replace(/(?<num>\d+) skipped/, bold(yellow('$<num> skipped')));
		}

		if (line.includes('obsolete')) {
			line = line.replace(/(?<num>\d+) obsolete/, bold(yellow('$<num> obsolete')));
		}

		if (line.includes('failed')) {
			line = line.replace(/(?<num>\d+) failed/, bold(red('$<num> failed')));
		}

		summary.push(line);
	}

	return summary.join('\n');
}
