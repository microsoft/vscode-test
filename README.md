# vscode-test

This module helps you testing VS Code extensions.

## Usage

See https://github.com/octref/vscode-test-sample for more usage.

```ts
import * as path from 'path'

import { runTests } from 'vscode-test'

async function go() {

  const extensionPath = path.resolve(__dirname, '../../')
  const testRunnerPath = path.resolve(__dirname, './suite')
  const testWorkspace = path.resolve(__dirname, '../../test-fixtures/fixture1')

  /**
   * Basic usage
   */
  await runTests({
    extensionPath,
    testRunnerPath,
    testWorkspace
  })

}

go()
```

## License

[MIT](LICENSE)

## Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
