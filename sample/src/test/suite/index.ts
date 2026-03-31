import * as fs from 'fs';
import * as path from 'path';
import * as Mocha from 'mocha';

function findTestFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const fullPath = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findTestFiles(fullPath));
		} else if (entry.name.endsWith('.test.js')) {
			results.push(fullPath);
		}
	}
	return results;
}

export function run(testsRoot: string, cb: (error: unknown, failures?: number) => void): void {
	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});

	try {
		const files = findTestFiles(testsRoot);

		// Add files to the test suite
		files.forEach((f) => mocha.addFile(f));

		// Run the mocha test
		mocha.run((failures) => {
			cb(null, failures);
		});
	} catch (err) {
		console.error(err);
		cb(err);
	}
}
