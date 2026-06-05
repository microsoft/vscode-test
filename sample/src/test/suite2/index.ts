import * as path from 'path';
import { fileURLToPath } from 'url';
import Mocha from 'mocha';
import { glob } from 'glob';

export function run(_testsRoot: string, cb: (error: unknown, failures?: number) => void): void {
	const testsRoot = path.dirname(fileURLToPath(import.meta.url));

	// Create the mocha test
	const mocha = new Mocha({
		ui: 'tdd',
	});

	glob('**/**.test.js', { cwd: testsRoot })
		.then(async (files) => {
			// Add files to the test suite
			files.forEach((f) => mocha.addFile(path.resolve(testsRoot, f)));

			// Load files via dynamic import so ESM test modules resolve correctly
			await mocha.loadFilesAsync();

			try {
				// Run the mocha test
				mocha.run((failures) => {
					cb(null, failures);
				});
			} catch (err) {
				cb(err);
			}
		})
		.catch((err) => {
			return cb(err);
		});
}
