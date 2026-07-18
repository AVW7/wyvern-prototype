import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const roots = ['src', 'scripts', 'tests'];
const files = [];

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(file);
    else if (file.endsWith('.js') || file.endsWith('.mjs')) files.push(file);
  }
}

for (const root of roots) {
  try {
    await collect(root);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Syntax OK: ${files.length} JavaScript modules.`);
