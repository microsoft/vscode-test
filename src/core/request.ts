/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IncomingMessage } from 'http';
import * as https from 'https';
import { urlToOptions } from './util';

export async function getStream(api: string): Promise<IncomingMessage> {
	return new Promise<IncomingMessage>((resolve, reject) => {
		https.get(api, urlToOptions(api), res => resolve(res)).on('error', reject)
	});
}

export async function getJSON<T>(api: string): Promise<T> {
	return new Promise((resolve, reject) => {
		https.get(api, urlToOptions(api), res => {
			if (res.statusCode !== 200) {
				reject('Failed to get JSON');
			}

			let data = '';

			res.on('data', chunk => {
				data += chunk;
			});

			res.on('end', () => {
				try {
					const jsonData = JSON.parse(data);
					resolve(jsonData);
				} catch (err) {
					console.error(`Failed to parse response from ${api} as JSON`);
					reject(err);
				}
			});

			res.on('error', err => {
				reject(err);
			});
		});
	});
}
