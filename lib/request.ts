/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IncomingMessage } from 'http';
import * as https from 'https';
import { urlToOptions } from './util';

export async function getStream(api: string, timeout: number): Promise<IncomingMessage> {
	const ctrl = new TimeoutController(timeout);
	return new Promise<IncomingMessage>((resolve, reject) => {
		ctrl.signal.addEventListener('abort', () => {
			reject(new TimeoutError(timeout));
			req.destroy();
		});
		const req = https.get(api, urlToOptions(api), (res) => resolve(res)).on('error', reject);
	}).finally(() => ctrl.dispose());
}

export async function getJSON<T>(api: string, timeout: number): Promise<T> {
	const ctrl = new TimeoutController(timeout);

	return new Promise<T>((resolve, reject) => {
		ctrl.signal.addEventListener('abort', () => {
			reject(new TimeoutError(timeout));
			req.destroy();
		});

		const req = https
			.get(api, urlToOptions(api), (res) => {
				if (res.statusCode !== 200) {
					reject('Failed to get JSON');
				}

				let data = '';

				res.on('data', (chunk) => {
					ctrl.touch();
					data += chunk;
				});

				res.on('end', () => {
					ctrl.dispose();

					try {
						const jsonData = JSON.parse(data);
						resolve(jsonData);
					} catch (err) {
						console.error(`Failed to parse response from ${api} as JSON`);
						reject(err);
					}
				});

				res.on('error', reject);
			})
			.on('error', reject);
	}).finally(() => ctrl.dispose());
}

export class TimeoutController {
	private handle: NodeJS.Timeout;
	private readonly ctrl = new AbortController();

	public get signal() {
		return this.ctrl.signal;
	}

	constructor(private readonly timeout: number) {
		this.handle = setTimeout(this.reject, timeout);
	}

	public touch() {
		clearTimeout(this.handle);
		this.handle = setTimeout(this.reject, this.timeout);
	}

	public dispose() {
		clearTimeout(this.handle);
	}

	private readonly reject = () => {
		this.ctrl.abort();
	};
}

export class TimeoutError extends Error {
	constructor(duration: number) {
		super(`@vscode/test-electron request timeout out after ${duration}ms`);
	}
}
