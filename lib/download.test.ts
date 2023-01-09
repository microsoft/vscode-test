import { spawnSync } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { downloadAndUnzipVSCode } from './download';
import { SilentReporter } from './progress';
import { resolveCliPathFromVSCodeExecutablePath, systemDefaultPlatform } from './util';

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

			const exePath = resolveCliPathFromVSCodeExecutablePath(location, platform);
			if (!existsSync(exePath)) {
				throw new Error(`expected ${exePath} to from ${location}`);
			}

			if (platform === systemDefaultPlatform) {
				const version = spawnSync(exePath, ['--version']);
				expect(version.status).to.equal(0);
				expect(version.stdout.toString().trim()).to.not.be.empty;
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
