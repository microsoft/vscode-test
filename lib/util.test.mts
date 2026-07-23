/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { SilentReporter } from './progress.js';
import {
	downloadDirToExecutablePath,
	insidersDownloadDirMetadata,
	insidersDownloadDirToExecutablePath,
} from './util.js';

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

describe('downloadDirToExecutablePath (darwin)', () => {
	let dir: string;

	beforeEach(async () => {
		dir = await fs.mkdtemp(join(tmpdir(), 'vscode-test-util-darwin-'));
	});

	afterEach(async () => {
		await fs.rm(dir, { recursive: true, force: true });
	});

	const macosDirFor = (bundleName: string) => join(dir, bundleName, 'Contents', 'MacOS');

	const writeInfoPlist = async (bundleName: string, cfBundleExecutable: string) => {
		const contentsDir = join(dir, bundleName, 'Contents');
		await fs.mkdir(contentsDir, { recursive: true });
		const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>CFBundleName</key>
	<string>${cfBundleExecutable}</string>
	<key>CFBundleExecutable</key>
	<string>${cfBundleExecutable}</string>
	<key>CFBundleIdentifier</key>
	<string>com.microsoft.VSCode</string>
</dict>
</plist>
`;
		await fs.writeFile(join(contentsDir, 'Info.plist'), plist);
	};

	const touchExecutable = async (bundleName: string, executableName: string) => {
		const macosDir = macosDirFor(bundleName);
		await fs.mkdir(macosDir, { recursive: true });
		await fs.writeFile(join(macosDir, executableName), '');
	};

	test('Stable: honors CFBundleExecutable from Info.plist (VS Code 1.110+)', async () => {
		await writeInfoPlist('Visual Studio Code.app', 'Code');
		await touchExecutable('Visual Studio Code.app', 'Code');
		const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code.app'), 'Code'));
	});

	test('Insiders: honors CFBundleExecutable from Info.plist (VS Code 1.110+)', async () => {
		await writeInfoPlist('Visual Studio Code - Insiders.app', 'Code - Insiders');
		await touchExecutable('Visual Studio Code - Insiders.app', 'Code - Insiders');
		const exePath = insidersDownloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code - Insiders.app'), 'Code - Insiders'));
	});

	// `fs.symlink` requires Developer Mode or elevated privileges on Windows and
	// throws EPERM otherwise, which would make the suite flaky in some CI setups
	// and for contributors on default Windows installs. The behavior under test is
	// darwin-specific — the platform argument to `downloadDirToExecutablePath` is
	// forced to `darwin-arm64` regardless of the host — so skipping on win32 loses
	// no coverage.
	test.skipIf(process.platform === 'win32')(
		'Stable: transitional symlink layout — plist name wins over Electron symlink',
		async () => {
			// Mirrors the 1.110 → 1.111 window where Contents/MacOS/ shipped both
			// the real `Code` binary and a compatibility `Electron -> Code` symlink.
			await writeInfoPlist('Visual Studio Code.app', 'Code');
			await touchExecutable('Visual Studio Code.app', 'Code');
			await fs.symlink('Code', join(macosDirFor('Visual Studio Code.app'), 'Electron'));
			const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
			expect(exePath).to.equal(join(macosDirFor('Visual Studio Code.app'), 'Code'));
		},
	);

	test('Stable: tier 2 picks the sole regular file when plist is missing', async () => {
		// Simulates a bundle whose Info.plist is unreadable / in binary format /
		// otherwise doesn't match the tier-1 regex, but whose Contents/MacOS/
		// still has exactly one binary. Ships as `Code` (post-1.110 layout).
		await touchExecutable('Visual Studio Code.app', 'Code');
		const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code.app'), 'Code'));
	});

	// See the win32 skip rationale above the transitional-symlink test.
	test.skipIf(process.platform === 'win32')(
		'Stable: tier 2 ignores the compatibility symlink and picks the real binary',
		async () => {
			// Plist absent → tier 1 skipped. Contents/MacOS/ has `Code` (real file)
			// and `Electron` (symlink); the sole-regular-file filter must collapse
			// to `Code`.
			const macosDir = macosDirFor('Visual Studio Code.app');
			await fs.mkdir(macosDir, { recursive: true });
			await fs.writeFile(join(macosDir, 'Code'), '');
			await fs.symlink('Code', join(macosDir, 'Electron'));
			const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
			expect(exePath).to.equal(join(macosDir, 'Code'));
		},
	);

	test('Stable: falls back to Electron when Info.plist is missing (pre-1.110)', async () => {
		// Pre-1.110 bundle: no plist read, tier 2 scan finds only `Electron`,
		// which happens to coincide with the tier-3 legacy name. Either way,
		// callers get a path that exists.
		await touchExecutable('Visual Studio Code.app', 'Electron');
		const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code.app'), 'Electron'));
	});

	test('Insiders: falls back to Electron when Info.plist is missing (pre-1.110)', async () => {
		await touchExecutable('Visual Studio Code - Insiders.app', 'Electron');
		const exePath = insidersDownloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code - Insiders.app'), 'Electron'));
	});

	test('Stable: falls back to Electron when Info.plist lacks CFBundleExecutable and MacOS/ is empty', async () => {
		const contentsDir = join(dir, 'Visual Studio Code.app', 'Contents');
		await fs.mkdir(contentsDir, { recursive: true });
		await fs.writeFile(
			join(contentsDir, 'Info.plist'),
			'<?xml version="1.0"?><plist version="1.0"><dict></dict></plist>',
		);
		const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor('Visual Studio Code.app'), 'Electron'));
	});

	test('Stable: rejects CFBundleExecutable containing path traversal', async () => {
		// Malformed / hostile plist declares a traversal payload. Tier 1 must
		// reject it (candidate not under macosDir), tier 2 finds the real
		// binary and returns that instead — never a path outside the bundle.
		const bundleName = 'Visual Studio Code.app';
		const contentsDir = join(dir, bundleName, 'Contents');
		await fs.mkdir(contentsDir, { recursive: true });
		await fs.writeFile(
			join(contentsDir, 'Info.plist'),
			'<?xml version="1.0"?><plist version="1.0"><dict>' +
				'<key>CFBundleExecutable</key><string>../../../etc/passwd</string>' +
				'</dict></plist>',
		);
		await touchExecutable(bundleName, 'Code');
		const exePath = downloadDirToExecutablePath(dir, 'darwin-arm64');
		expect(exePath).to.equal(join(macosDirFor(bundleName), 'Code'));
	});

	test('non-darwin platforms are unaffected', () => {
		expect(downloadDirToExecutablePath(dir, 'linux-x64')).to.equal(join(dir, 'code'));
		expect(downloadDirToExecutablePath(dir, 'win32-x64-archive')).to.equal(join(dir, 'Code.exe'));
		expect(insidersDownloadDirToExecutablePath(dir, 'linux-x64')).to.equal(join(dir, 'code-insiders'));
		expect(insidersDownloadDirToExecutablePath(dir, 'win32-x64-archive')).to.equal(join(dir, 'Code - Insiders.exe'));
	});
});
