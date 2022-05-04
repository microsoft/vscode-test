import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, test } from 'vitest';
import { downloadAndUnzipVSCode } from './download';
import { SilentReporter } from './progress';

const platforms = ['darwin', 'darwin-arm64', 'win32-archive', 'win32-x64-archive', 'linux-x64', 'linux-arm64', 'linux-armhf'];

describe('sane downloads', () => {
	const testTempDir = join(tmpdir(), 'vscode-test-download');

	beforeAll(async () => {
		await fs.mkdir(testTempDir, { recursive: true })
	});

	for (const platform of platforms) {
		test.concurrent(platform, async () => {
			const location = await downloadAndUnzipVSCode({
				platform,
				version: 'stable',
				cachePath: testTempDir,
				reporter: new SilentReporter(),
			});

			if (!existsSync(location)) {
				throw new Error(`expected ${location} to exist for ${platform}`);
			}
		})
	}

	afterAll(async () => {
		try {
			await fs.rmdir(testTempDir, { recursive: true });
		} catch {
			// ignored
		}
	});
});
