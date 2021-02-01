/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

function colorize(colorCode: string) {
	return (text: string): string => `\u001B[${colorCode}m${text}\u001B[0m`;
}

export const bold = colorize('1');
export const black = colorize('30');
export const red = colorize('31');
export const green = colorize('32');
export const yellow = colorize('33');
export const purple = colorize('35');
export const redBg = colorize('41');
export const greenBg = colorize('42');
export const darkGray = colorize('90');
export const white = colorize('97');
