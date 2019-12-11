import * as path from 'path'

import { runTests } from '../../lib/index'

async function go() {
	try {
		const extensionDevelopmentPath = path.resolve(__dirname, '../../../')
		const extensionTestsPath = path.resolve(__dirname, './suite')

		await runTests({
			extensionDevelopmentPath,
			extensionTestsPath,
			extensionTestsEnv: { foo: 'bar' }
		})
	} catch (err) {
		console.error('Failed to run tests')
		process.exit(1)
	}
}

go()
