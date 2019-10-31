/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as https from 'https';
import { urlToOptions } from './util';

export async function getJSON(api: string): Promise<any> {
	return new Promise((resolve, reject) => {
		https.get(urlToOptions(api), res => {
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
