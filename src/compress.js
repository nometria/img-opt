#!/usr/bin/env node
/**
 * Compress images to WebP using Sharp.
 *
 * By default compresses:
 *   1. Downloaded images in imagesDir (public/images/)
 *   2. Local uncompressed images found anywhere in the project (compressLocal: true)
 *
 * Improvements over v2.1:
 *   - GIF and BMP files are now compressed (not just PNG/JPG)
 *   - Parallel processing (configurable concurrency, default 4)
 *   - Smart skip: won't keep output if it's larger than the original
 *   - Configurable WebP effort level for better compression
 *   - Shows compression ratio in output
 *
 * Requires: npm add -D sharp
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './lib/get-config.js';
import { walkDir } from './lib/walk-dir.js';
import { buildIgnoreFilter } from './lib/ignore.js';

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];
const IMAGE_SCAN_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.bmp'];

/**
 * Find all uncompressed image files in given directories (recursively).
 * Skips files that already have a .webp sibling.
 */
function findLocalImages(dirs, projectRoot) {
  const files = [];
  for (const dir of dirs) {
    const absDir = path.join(projectRoot, dir);
    walkDir(absDir, IMAGE_SCAN_EXT, files);
  }
  // Deduplicate (same file might be in overlapping dirs)
  return [...new Set(files)];
}

/**
 * Compress a single image to WebP.
 * Returns { ok, skipped, inputSize, outputSize } or throws on error.
 */
async function compressOne(sharp, inputPath, outputPath, { quality, effort }) {
  const inputStat = fs.statSync(inputPath);
  const opts = { quality };
  if (effort !== undefined) opts.effort = effort;

  await sharp(inputPath).webp(opts).toFile(outputPath);

  const outputStat = fs.statSync(outputPath);

  // If output is larger than input, discard the WebP - it's not beneficial
  if (outputStat.size >= inputStat.size) {
    fs.unlinkSync(outputPath);
    return { ok: false, skipped: true, inputSize: inputStat.size, outputSize: outputStat.size };
  }

  return { ok: true, skipped: false, inputSize: inputStat.size, outputSize: outputStat.size };
}

/**
 * Process a batch of files with a given concurrency limit.
 */
async function processBatch(sharp, items, { quality, effort, removeOriginals, concurrency }) {
  let completed = 0;
  let skipped = 0;

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const results = await Promise.all(
      batch.map(async ({ inputPath, outputPath, displayName }) => {
        try {
          const result = await compressOne(sharp, inputPath, outputPath, { quality, effort });

          if (result.skipped) {
            console.log(`  ${displayName} -> SKIPPED (WebP would be larger)`);
            return { ok: false, skipped: true };
          }

          const ratio = ((1 - result.outputSize / result.inputSize) * 100).toFixed(0);
          if (removeOriginals) fs.unlinkSync(inputPath);
          console.log(
            `  ${displayName} -> ${path.basename(outputPath)} OK (${(result.outputSize / 1024).toFixed(1)} KB, ${ratio}% smaller)`
          );
          return { ok: true, skipped: false };
        } catch (err) {
          console.log(`  ${displayName} -> FAILED: ${err.message}`);
          return { ok: false, skipped: false };
        }
      })
    );

    for (const r of results) {
      if (r.ok) completed++;
      if (r.skipped) skipped++;
    }
  }

  return { completed, skipped };
}

async function main() {
  const { config, projectRoot } = await getConfig();
  const imagesDir = path.join(projectRoot, config.imagesDir);
  const compressOpt = config.compress || {};
  const quality = compressOpt.quality ?? 82;
  const effort = compressOpt.effort; // undefined = sharp default (4)
  const removeOriginals = compressOpt.removeOriginals !== false;
  const concurrency = compressOpt.concurrency ?? 4;
  const shouldIgnore = buildIgnoreFilter(config.ignore);

  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Sharp not found. Install with: npm add -D sharp');
    process.exit(1);
  }

  // ── 1. Compress downloaded images in imagesDir ────────────────────────
  let downloadedCount = 0;
  let downloadedSkipped = 0;
  if (fs.existsSync(imagesDir)) {
    const files = fs.readdirSync(imagesDir);
    const toCompress = files.filter((f) => {
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXT.includes(ext) && !shouldIgnore(f) && !shouldIgnore(path.join(imagesDir, f));
    });

    if (toCompress.length) {
      console.log(`Compressing ${toCompress.length} downloaded image(s) in ${config.imagesDir}/\n`);

      const items = toCompress.map((file) => {
        const ext = path.extname(file);
        const base = path.basename(file, ext);
        return {
          inputPath: path.join(imagesDir, file),
          outputPath: path.join(imagesDir, `${base}.webp`),
          displayName: file,
        };
      });

      const result = await processBatch(sharp, items, { quality, effort, removeOriginals, concurrency });
      downloadedCount = result.completed;
      downloadedSkipped = result.skipped;
    }
  }

  // ── 2. Compress local project images (compressLocal) ──────────────────
  let localCount = 0;
  let localSkipped = 0;
  if (config.compressLocal) {
    // Scan replaceInDirs + public/ for uncompressed images
    const scanDirs = [...new Set([...(config.replaceInDirs || ['src']), 'public'])];
    const localFiles = findLocalImages(scanDirs, projectRoot);

    // Filter out files already in imagesDir (handled above) and ignored files
    const toCompress = localFiles.filter((f) => {
      if (f.startsWith(imagesDir + path.sep) || f.startsWith(imagesDir + '/')) return false;
      const rel = path.relative(projectRoot, f);
      if (shouldIgnore(rel) || shouldIgnore(f)) return false;
      // Skip if a .webp sibling already exists
      const webpSibling = f.replace(/\.[^.]+$/, '.webp');
      if (fs.existsSync(webpSibling)) return false;
      return true;
    });

    if (toCompress.length) {
      console.log(`\nCompressing ${toCompress.length} local image(s) found in project\n`);

      const items = toCompress.map((inputPath) => {
        const ext = path.extname(inputPath);
        const base = path.basename(inputPath, ext);
        const dir = path.dirname(inputPath);
        return {
          inputPath,
          outputPath: path.join(dir, `${base}.webp`),
          displayName: path.relative(projectRoot, inputPath),
        };
      });

      const result = await processBatch(sharp, items, { quality, effort, removeOriginals, concurrency });
      localCount = result.completed;
      localSkipped = result.skipped;
    }
  }

  const total = downloadedCount + localCount;
  const totalSkipped = downloadedSkipped + localSkipped;
  if (total === 0 && totalSkipped === 0) {
    console.log('No uncompressed images found (.png, .jpg, .jpeg, .gif, .bmp).');
  } else {
    console.log(`\nDone. Compressed ${total} image(s) to WebP.`);
    if (totalSkipped > 0) {
      console.log(`Skipped ${totalSkipped} image(s) where WebP would be larger than the original.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
