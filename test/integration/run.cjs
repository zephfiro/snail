const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, 'suite/index.cjs');
  await runTests({
    extensionDevelopmentPath,
    extensionTestsPath,
    launchArgs: ['--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--no-sandbox']
  });
}

main().catch(error => {
  console.error('VS Code Extension Host integration failed:', error);
  process.exitCode = 1;
});
