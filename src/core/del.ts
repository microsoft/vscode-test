/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

 import * as rimraf from 'rimraf';

// todo: rmdir supports a `recurse` option as of Node 12. Drop rimraf when 10 is EOL.
export function rmdir(dir: string) {
	return new Promise<void>((c, e) => {
		rimraf(dir, err => {
			if (err) {
				return e(err);
			}

			c();
		});
	});
}
