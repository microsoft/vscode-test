/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SilentReporter } from './progress.js';
import { insidersDownloadDirMetadata } from './util.js';

describe('insidersDownloadDirMetadata (win32)', () => {
	let dir: string;
	const hash = '39d5031f219542f8db0bcb2aa5327137b43bb1e4';
	const date = '2024-01-02T03:04:05.000Z';

	beforeEach(async () => {
		dir = await fs.mkdtemp(join(tmpdir(), 'vscode-test-util-'));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const writeProductJson = async (relativeDir: string, commit: string) => {
		const target = join(dir, relativeDir, 'resources', 'app', 'product.json');
		await fs.mkdir(join(dir, relativeDir, 'resources', 'app'), { recursive: true });
		await fs.writeFile(target, JSON.stringify({ commit, date }));
	};

	test('reads metadata from the versioned folder when up to date', async () => {
		await writeProductJson(hash.slice(0, 10), hash);

		const metadata = insidersDownloadDirMetadata(dir, 'win32-x64-archive', new SilentReporter(), hash);
		expect(metadata.version).to.equal(hash);
		expect(metadata.date.toISOString()).to.equal(date);
	});

	test('reads installed metadata even when the install is outdated', async () => {
		const installedHash = 'abcdef0123456789abcdef0123456789abcdef01';
		await writeProductJson(installedHash.slice(0, 10), installedHash);

		// latestHash differs from the installed build's commit
		const metadata = insidersDownloadDirMetadata(dir, 'win32-x64-archive', new SilentReporter(), hash);
		expect(metadata.version).to.equal(installedHash);
		expect(metadata.date.toISOString()).to.equal(date);
	});

	test('reads metadata from the legacy flat layout', async () => {
		await writeProductJson('.', hash);

		const metadata = insidersDownloadDirMetadata(dir, 'win32-x64-archive', new SilentReporter(), hash);
		expect(metadata.version).to.equal(hash);
		expect(metadata.date.toISOString()).to.equal(date);
	});

	test('returns unknown when product.json is missing', async () => {
		const metadata = insidersDownloadDirMetadata(dir, 'win32-x64-archive', new SilentReporter(), hash);
		expect(metadata.version).to.equal('unknown');
		expect(metadata.date.getTime()).to.equal(0);
	});
});
