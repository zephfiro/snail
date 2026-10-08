const { downloadAndUnzipVSCode } = require('@vscode/test-electron');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
async function main() {
  if (process.platform !== 'linux') throw new Error('Packaged CLI verification currently supports Linux CI.');
  const vsix = path.resolve(__dirname, '../snail-doctor-0.1.0.vsix');
  if (!fs.existsSync(vsix)) throw new Error('VSIX not found: ' + vsix);
  const executable = await downloadAndUnzipVSCode();
  const cli = path.resolve(path.dirname(executable), 'bin/code');
  if (!fs.existsSync(cli)) throw new Error('VS Code CLI not found at ' + cli);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'snail-vsix-'));
  const extensionsDir = path.join(dir, 'extensions');
  const userDataDir = path.join(dir, 'userdata');
  try {
    const args = ['--extensions-dir', extensionsDir, '--user-data-dir', userDataDir, '--no-sandbox'];
    const install = spawnSync(cli,[...args,'--install-extension',vsix,'--force'],{encoding:'utf8',timeout:120000});
    if (install.status !== 0) throw Error('VSIX install failed: ' + (install.stderr || install.stdout));
    const list = spawnSync(cli,[...args,'--list-extensions','--show-versions'],{encoding:'utf8',timeout:120000});
    if (list.status !== 0 || !list.stdout.includes('zephfiro.snail-doctor@0.1.0')) {
      throw Error('Installed extension not listed: ' + (list.stdout || list.stderr));
    }
    console.log('VSIX installed successfully in isolated VS Code extension directory.');
  } finally {
    fs.rmSync(dir,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
