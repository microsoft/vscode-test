/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { spawnSync } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Readable } from 'stream';
import {
	downloadAndUnzipVSCode,
	fetchInsiderVersions,
	fetchStableVersions,
	fetchTargetInferredVersion,
	spawnDecompressorChild,
} from './download.js';
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
	const testTempDir = join(tmpdir(), 'vscode-test-download');

	beforeAll(async () => {
		await fs.mkdir(testTempDir, { recursive: true });
	});

	for (const quality of ['insiders', 'stable']) {
		for (const platform of platforms) {
			test.concurrent(`${quality}/${platform}`, async () => {
				const location = await downloadAndUnzipVSCode({
					platform,
					version: quality,
					cachePath: testTempDir,
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

	afterAll(async () => {
		try {
			await fs.rm(testTempDir, { recursive: true, force: true });
		} catch {
			// ignored
		}
	});
});

describe('fetchTargetInferredVersion', () => {
	let stable: string[];
	let insiders: string[];
	const extensionsDevelopmentPath = join(tmpdir(), 'vscode-test-tmp-workspace');

	beforeAll(async () => {
		[stable, insiders] = await Promise.all([fetchStableVersions(true, 15_000), fetchInsiderVersions(true, 15_000)]);
	});

	afterEach(async () => {
		await fs.rm(extensionsDevelopmentPath, { recursive: true, force: true });
	});

	const writeJSON = async (path: string, contents: unknown) => {
		const target = join(extensionsDevelopmentPath, path);
		await fs.mkdir(dirname(target), { recursive: true });
		await fs.writeFile(target, JSON.stringify(contents));
	};

	const doFetch = (paths = ['./']) =>
		fetchTargetInferredVersion({
			cachePath: join(extensionsDevelopmentPath, '.cache'),
			platform: 'win32-x64-archive',
			timeout: 15_000,
			extensionsDevelopmentPath: paths.map((p) => join(extensionsDevelopmentPath, p)),
		});

	test('matches stable if no workspace', async () => {
		const version = await doFetch();
		expect(version.id).to.equal(stable[0]);
	});

	test('matches stable by default', async () => {
		await writeJSON('package.json', {});
		const version = await doFetch();
		expect(version.id).to.equal(stable[0]);
	});

	test('matches if stable is defined', async () => {
		await writeJSON('package.json', { engines: { vscode: '^1.50.0' } });
		const version = await doFetch();
		expect(version.id).to.equal(stable[0]);
	});

	test('matches best', async () => {
		await writeJSON('package.json', { engines: { vscode: '<=1.60.5' } });
		const version = await doFetch();
		expect(version.id).to.equal('1.60.2');
	});

	test('matches multiple workspaces', async () => {
		await writeJSON('a/package.json', { engines: { vscode: '<=1.60.5' } });
		await writeJSON('b/package.json', { engines: { vscode: '<=1.55.5' } });
		const version = await doFetch(['a', 'b']);
		expect(version.id).to.equal('1.55.2');
	});

	test('matches insiders to better stable if there is one', async () => {
		await writeJSON('package.json', { engines: { vscode: '^1.60.0-insider' } });
		const version = await doFetch();
		expect(version.id).to.equal(stable[0]);
	});

	test('matches current insiders', async () => {
		await writeJSON('package.json', { engines: { vscode: `^${insiders[0]}` } });
		const version = await doFetch();
		expect(version.id).to.equal(insiders[0]);
	});

	test('matches insiders to exact', async () => {
		await writeJSON('package.json', { engines: { vscode: '1.60.0-insider' } });
		const version = await doFetch();
		expect(version.id).to.equal('1.60.0-insider');
	});
});

describe('spawnDecompressorChild', () => {
	const spawnedPids: number[] = [];
	const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

	const isRunning = (pid: number) => {
		try {
			process.kill(pid, 0);
			return true;
		} catch {
			return false;
		}
	};

	afterAll(async () => {
		// Best-effort cleanup: a failing run (e.g. against unfixed code) must
		// not leak the decompressor children it spawned.
		for (const pid of spawnedPids) {
			try {
				process.kill(pid);
			} catch {
				// already gone
			}
		}
	});

	test('kills the child when the input stream errors', async () => {
		// A child that publishes its pid, then blocks reading stdin forever,
		// exactly like `tar -xzf -` waiting for the rest of the archive body.
		const pidFile = join(tmpdir(), `vscode-test-child-${Date.now()}.pid`);
		const script =
			`require('fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ` + `process.stdin.resume();`;
		const input = new Readable({
			read() {
				// hold the stream open, as a download in progress would
			},
		});

		const promise = spawnDecompressorChild(process.execPath, ['-e', script], input);

		// Wait for the child to be up and blocked on stdin before failing the
		// stream, so the test targets a genuinely-running child.
		let pid = 0;
		for (let i = 0; i < 100 && !existsSync(pidFile); i++) {
			await wait(100);
		}
		pid = Number((await fs.readFile(pidFile)).toString());
		spawnedPids.push(pid);

		input.emit('error', new Error('aborted mid-download'));

		await expect(promise).rejects.toThrow(/aborted mid-download/);

		// The failed attempt must not leave the decompressor child behind: on
		// unfixed code the child stays blocked on stdin and its pipes keep the
		// Node.js event loop alive, so the process never exits -- even if a
		// later retry succeeds.
		const deadline = Date.now() + 15_000;
		while (Date.now() < deadline) {
			if (!isRunning(pid)) {
				return;
			}
			await wait(100);
		}
		throw new Error(`decompressor child ${pid} still alive after the input stream failed`);
	});

	test('resolves when the input ends and the child exits cleanly', async () => {
		const input = new Readable({
			read() {
				this.push('hello');
				this.push(null);
			},
		});

		await spawnDecompressorChild(process.execPath, ['-e', 'process.stdin.resume()'], input);
	});

	test('rejects when the child exits with a non-zero code', async () => {
		await expect(spawnDecompressorChild(process.execPath, ['-e', 'process.exit(3)'])).rejects.toThrow(
			/Failed to unzip archive, exited with 3/,
		);
	});
});
