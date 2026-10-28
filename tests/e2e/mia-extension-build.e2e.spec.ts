import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, readFile, rename, writeFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('MIA development build watches edits, retains the last valid build, and recovers', async () => {
  const sourceApp = resolve('apps/mia-chrome-extension');
  const app = test.info().outputPath('watch-app');
  await cp(sourceApp, app, {
    recursive: true,
    filter: (source) =>
      !['dist', '.output', 'node_modules'].includes(
        relative(sourceApp, source).split(/[\\/]/)[0] ?? '',
      ),
  });
  const watcher = spawn(process.execPath, ['build.mjs', '--watch'], {
    cwd: app,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(watcher, 'exit');
  let output = '';
  watcher.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  watcher.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString();
  });
  try {
    await expect.poll(() => output).toContain('Watching MIA extension files.');
    const htmlPath = join(app, 'sidepanel.html');
    const html = await readFile(htmlPath, 'utf8');
    // Exercise an editor-style atomic replacement, followed by another save.
    await writeFile(`${htmlPath}.next`, `${html}\n<!-- synthetic watch edit -->\n`);
    await rename(`${htmlPath}.next`, htmlPath);
    await expect
      .poll(() => readFile(join(app, 'dist/sidepanel.html'), 'utf8').catch(() => ''))
      .toContain('synthetic watch edit');
    await writeFile(htmlPath, `${html}\n<!-- second synthetic watch edit -->\n`);
    await expect
      .poll(() => readFile(join(app, 'dist/sidepanel.html'), 'utf8').catch(() => ''))
      .toContain('second synthetic watch edit');

    const scriptPath = join(app, 'src/mia-auth-content.js');
    const script = await readFile(scriptPath, 'utf8');
    await writeFile(scriptPath, 'const invalid = ;');
    await expect.poll(() => output).toContain('Extension build failed; fix the source to rebuild.');
    expect(await readFile(join(app, 'dist/src/mia-auth-content.js'), 'utf8')).toBe(script);
    await writeFile(scriptPath, `${script}\n// synthetic recovery edit\n`);
    await expect
      .poll(() => readFile(join(app, 'dist/src/mia-auth-content.js'), 'utf8').catch(() => ''))
      .toContain('synthetic recovery edit');
    expect(watcher.exitCode).toBeNull();
  } finally {
    watcher.kill();
    await exited;
  }
});
