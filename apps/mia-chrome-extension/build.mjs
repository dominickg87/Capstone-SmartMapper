import { execFileSync } from 'node:child_process';
import { watch } from 'node:fs';
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const appDirectory = import.meta.dirname;
const outputDirectory = resolve(appDirectory, 'dist');
const runtimeFiles = [
  'manifest.json',
  'sidepanel.html',
  'src',
  'icons',
  'pdf-lib.min.js',
  'pdf-merger.css',
  'pdf-merger.js',
];

async function build() {
  // The manifest and side panel load these scripts directly.
  for (const script of [
    'src/background.js',
    'src/content.js',
    'src/mia-auth-content.js',
    'src/sidepanel.js',
    'pdf-merger.js',
  ]) {
    execFileSync(process.execPath, ['--check', join(appDirectory, script)], {
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  const manifest = JSON.parse(await readFile(join(appDirectory, 'manifest.json'), 'utf8'));
  if (manifest.manifest_version !== 3 || !manifest.permissions?.includes('sidePanel')) {
    throw new Error('Unexpected extension entry points. Review the build file list.');
  }
  // Only remove this application's generated output, never a caller-supplied path.
  if (dirname(outputDirectory) !== appDirectory || outputDirectory !== join(appDirectory, 'dist')) {
    throw new Error('Build output must stay inside the extension application.');
  }
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  for (const file of runtimeFiles) {
    await cp(join(appDirectory, file), join(outputDirectory, file), { recursive: true });
  }
  console.log(`Chrome Load unpacked: ${outputDirectory}`);
  process.exitCode = 0;
}

await build();

if (process.argv.includes('--watch')) {
  let debounceTimer;
  let builds = Promise.resolve();
  // Watch the directory so editor saves that replace a file still trigger future
  // rebuilds. Only runtime inputs count; generated dist/.output events are ignored.
  watch(appDirectory, { recursive: true }, (_event, filename) => {
    const rootEntry = filename?.toString().split(/[\\/]/)[0];
    if (!runtimeFiles.includes(rootEntry)) return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      // Serialize rebuilds so bursts of file changes cannot race over dist.
      builds = builds.then(build).catch((error) => {
        console.error('Extension build failed; fix the source to rebuild.', error.message);
        process.exitCode = 1;
      });
    }, 100);
  });
  console.log('Watching MIA extension files. Reload the extension in Chrome after each rebuild.');
}
