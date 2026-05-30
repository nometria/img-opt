/**
 * Shared directory walker - recursively find files matching given extensions.
 * Used by scan.js and replace.js.
 */

import fs from 'fs';
import path from 'path';

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit',
  'dist', 'build', '.output', 'coverage', '.cache',
]);

export function walkDir(dir, exts, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walkDir(full, exts, files);
    } else if (exts.some((ext) => e.name.toLowerCase().endsWith(ext))) {
      files.push(full);
    }
  }
  return files;
}
