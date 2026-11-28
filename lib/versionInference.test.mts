/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fetchTargetInferredVersion } from './download.js';

vi.mock('./request.js', () => ({
	getJSON(url: string) {
		switch (url) {
			case 'https://update.code.visualstudio.com/api/releases/stable?released=true':
				return Promise.resolve(['1.70.0', '1.60.2', '1.55.2']);
			case 'https://update.code.visualstudio.com/api/releases/insider?released=true':
				return Promise.resolve(['1.71.0-insider', '1.60.0-insider']);
			default:
				throw new Error(`Unexpected release URL: ${url}`);
		}
	},
}));

describe('fetchTargetInferredVersion', () => {
	let extensionsDevelopmentPath: string;

	beforeEach(async () => {
		extensionsDevelopmentPath = await fs.mkdtemp(join(tmpdir(), 'vscode-test-version-'));
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
		expect(version.id).to.equal('1.70.0');
	});

	test('matches stable by default', async () => {
		await writeJSON('package.json', {});
		const version = await doFetch();
		expect(version.id).to.equal('1.70.0');
	});

	test('matches if stable is defined', async () => {
		await writeJSON('package.json', { engines: { vscode: '^1.50.0' } });
		const version = await doFetch();
		expect(version.id).to.equal('1.70.0');
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
		expect(version.id).to.equal('1.70.0');
	});

	test('matches current insiders', async () => {
		await writeJSON('package.json', { engines: { vscode: '^1.71.0-insider' } });
		const version = await doFetch();
		expect(version.id).to.equal('1.71.0-insider');
	});

	test('matches insiders to exact', async () => {
		await writeJSON('package.json', { engines: { vscode: '1.60.0-insider' } });
		const version = await doFetch();
		expect(version.id).to.equal('1.60.0-insider');
	});
});
