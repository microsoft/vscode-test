/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import { EventEmitter } from 'events';
import { describe, expect, test, vi } from 'vitest';
import { runTests } from './runTest.js';

vi.mock('child_process', async (importOriginal) => {
	const actual = await importOriginal<typeof cp>();
	return { ...actual, spawn: vi.fn() };
});

describe('runTests', () => {
	test('spawns executable directly (no shell) so paths with spaces work', async () => {
		const spawnMock = vi.mocked(cp.spawn);

		// Build a minimal fake ChildProcess
		const proc = new EventEmitter() as ReturnType<typeof cp.spawn>;
		const stdioEmitter = Object.assign(new EventEmitter(), { destroy: vi.fn() });
		const fakeProc = proc as unknown as { stdout: unknown; stderr: unknown; pid: unknown; kill: unknown };
		fakeProc.stdout = stdioEmitter;
		fakeProc.stderr = stdioEmitter;
		fakeProc.pid = 12345;
		fakeProc.kill = vi.fn();

		spawnMock.mockReturnValue(proc);

		const executableWithSpaces = '/path with spaces/Code';
		const extensionPath = '/ext path with spaces/my-extension';
		const testsPath = '/tests with spaces/suite';

		// Start runTests; all event listeners are registered synchronously (inside the
		// Promise constructor) before innerRunTests reaches its first `await`, so it is
		// safe to emit 'exit' immediately after the call returns the promise.
		const promise = runTests({
			vscodeExecutablePath: executableWithSpaces,
			extensionDevelopmentPath: extensionPath,
			extensionTestsPath: testsPath,
			reuseMachineInstall: true, // skip profile-dir arguments to keep the assertion simple
		});

		proc.emit('exit', 0, null);
		await promise;

		expect(spawnMock).toHaveBeenCalledOnce();
		const [spawnExe, spawnArgs, spawnOpts] = spawnMock.mock.calls[0];

		// The executable must NOT be wrapped in quotes.
		expect(spawnExe).toBe(executableWithSpaces);

		// shell must NOT be true — enabling the shell causes Node.js to concatenate
		// all arguments into a single string passed to cmd.exe, which splits on spaces
		// and breaks paths that contain them.
		expect((spawnOpts as cp.SpawnOptions).shell).toBeFalsy();

		// Path arguments must be passed verbatim, spaces preserved.
		expect(spawnArgs as string[]).toContain(`--extensionTestsPath=${testsPath}`);
		expect(spawnArgs as string[]).toContain(`--extensionDevelopmentPath=${extensionPath}`);
	});
});
