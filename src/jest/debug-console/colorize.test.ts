/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { bold, black, red, green, yellow, purple, redBg, greenBg, darkGray, white } from './colorize';

test('adds bold formatting to text', () => {
	expect(bold('text')).toMatchInlineSnapshot(`"[1mtext[0m"`);
});

test('adds black formatting to text', () => {
	expect(black('text')).toMatchInlineSnapshot(`"[30mtext[0m"`);
});

test('adds red formatting to text', () => {
	expect(red('text')).toMatchInlineSnapshot(`"[31mtext[0m"`);
});

test('adds green formatting to text', () => {
	expect(green('text')).toMatchInlineSnapshot(`"[32mtext[0m"`);
});

test('adds yellow formatting to text', () => {
	expect(yellow('text')).toMatchInlineSnapshot(`"[33mtext[0m"`);
});

test('adds purple formatting to text', () => {
	expect(purple('text')).toMatchInlineSnapshot(`"[35mtext[0m"`);
});

test('adds redBg formatting to text', () => {
	expect(redBg('text')).toMatchInlineSnapshot(`"[41mtext[0m"`);
});

test('adds greenBg formatting to text', () => {
	expect(greenBg('text')).toMatchInlineSnapshot(`"[42mtext[0m"`);
});

test('adds darkGray formatting to text', () => {
	expect(darkGray('text')).toMatchInlineSnapshot(`"[90mtext[0m"`);
});

test('adds white formatting to text', () => {
	expect(white('text')).toMatchInlineSnapshot(`"[97mtext[0m"`);
});
