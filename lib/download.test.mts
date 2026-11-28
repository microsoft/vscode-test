/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { downloadAndUnzipVSCode } from './download.js';
import { SilentReporter } from './progress.js';
import { isRunnableOnHost, resolveCliPathFromVSCodeExecutablePath } from './util.js';

const platforms = [
	'darwin',
	'darwin-arm64',
	'win32-x64-archive',
	'win32-arm64-archive',
	'linux-x64',
	'linux-arm64',
	'linux-armhf',

	'cli-linux-x64',
	'cli-win32-x64',
	'cli-darwin-x64',

	'server-win32-x64',
	'server-darwin',
	'server-linux-x64',
];

describe('sane downloads', () => {
	let testTempDir: string;

	beforeAll(async () => {
		testTempDir = await fs.mkdtemp(join(tmpdir(), 'vscode-test-download-'));
	});

	for (const quality of ['insiders', 'stable']) {
		for (const platform of platforms) {
			// Keep at most one extracted build on disk at a time.
			test.sequential(`${quality}/${platform}`, async ({ onTestFinished }) => {
				const cachePath = join(testTempDir, `${quality}-${platform}`);
				onTestFinished(() => fs.rm(cachePath, { recursive: true, force: true }));
				const location = await downloadAndUnzipVSCode({
					platform,
					version: quality,
					cachePath,
					reporter: new SilentReporter(),
					timeout: 60_000,
				});

				if (!existsSync(location)) {
					throw new Error(`expected ${location} to exist for ${platform}`);
				}

				const exePath = resolveCliPathFromVSCodeExecutablePath(location, platform);
				if (!existsSync(exePath)) {
					throw new Error(`expected ${exePath} to from ${location}`);
				}

				if (isRunnableOnHost(platform)) {
					const shell = process.platform === 'win32';
					const version = spawnSync(shell ? `"${exePath}"` : exePath, ['--version'], { shell });
					expect(version.status).to.equal(0);
					expect(version.stdout.toString().trim()).to.not.be.empty;
				}
			});
		}
	}

	afterAll(() => fs.rm(testTempDir, { recursive: true, force: true }));
});
