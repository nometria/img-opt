#!/usr/bin/env node
/**
 * Replace image and video URLs in source files:
 *   - External URLs → /images/name.webp (or /videos/name.webm)
 *   - Local .png/.jpg/.jpeg → .webp  (both in imagesDir and in-place local assets)
 *   - Local .mp4/.mov/.avi/.mkv/.m4v → .webm
 *
 * Run from project root: npx img-opt replace [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './lib/get-config.js';
import { walkDir } from './lib/walk-dir.js';
import { buildIgnoreFilter } from './lib/ignore.js';
import { scanForUrls, urlToFilename } from './scan.js';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function webPath(dir) {
  const raw = dir.replace(/\\/g, '/').replace(/\/+$/, '');
  return '/' + (raw.replace(/^public\/?/, '') || 'images');
}

/**
 * Strip query string and fragment from a URL.
 * e.g. "https://images.unsplash.com/photo-123?w=1920&q=80" → "https://images.unsplash.com/photo-123"
 */
function stripQuery(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return url.split('?')[0].split('#')[0];
  }
}

/**
 * Build a lookup from sanitized base name → .webp filename for all .webp files
 * currently in imagesDir. Used as a fallback when the scanner's predicted filename
 * doesn't exactly match what's on disk (e.g. due to dedup suffixes or renames).
 */
function buildWebpLookup(dir) {
  const lookup = new Map();
  if (!fs.existsSync(dir)) return lookup;
  for (const f of fs.readdirSync(dir)) {
    if (f.toLowerCase().endsWith('.webp')) {
      const base = path.basename(f, '.webp');
      lookup.set(base, f);
    }
  }
  return lookup;
}

async function main() {
  if (DRY_RUN) console.log('[dry-run] No files will be modified.\n');

  const { config, projectRoot } = await getConfig();
  const imagesDir = path.join(projectRoot, config.imagesDir);
  const videosDir = path.join(projectRoot, config.videosDir);
  const imagesDirWeb = webPath(config.imagesDir);
  const videosDirWeb = webPath(config.videosDir);
  const shouldIgnore = buildIgnoreFilter(config.ignore);

  const replacements = [];

  // ── Image source URL replacements ──────────────────────────────────
  let imageSources = (config.sources || []).filter((s) => !shouldIgnore(s.url));
  let videoSources = (config.videoSources || []).filter((s) => !shouldIgnore(s.url));

  // Auto-scan: if no manual sources, discover URLs from codebase
  if (!imageSources.length && !videoSources.length && config.autoScan) {
    const scanResult = await scanForUrls({
      projectRoot,
      scanDirs: config.replaceInDirs,
      scanExtensions: config.replaceExtensions,
      ignore: config.ignore,
    });
    imageSources = scanResult.images;
    videoSources = scanResult.videos;
  }

  // Build a lookup of all .webp files on disk for fallback matching
  const webpOnDisk = buildWebpLookup(imagesDir);

  // Map each scanned/configured image URL → /images/base.webp
  let skippedImages = 0;
  for (const { url, file } of imageSources) {
    const base = path.basename(file, path.extname(file));
    const webpFile = `${base}.webp`;

    // Primary check: exact predicted filename
    if (fs.existsSync(path.join(imagesDir, webpFile))) {
      replacements.push({ from: url, to: `${imagesDirWeb}/${webpFile}` });
      continue;
    }

    // Fallback: try deriving filename from URL without query params
    const bareUrl = stripQuery(url);
    if (bareUrl !== url) {
      const bareFilename = urlToFilename(bareUrl);
      const bareBase = path.basename(bareFilename, path.extname(bareFilename));
      const bareWebp = `${bareBase}.webp`;
      if (fs.existsSync(path.join(imagesDir, bareWebp))) {
        replacements.push({ from: url, to: `${imagesDirWeb}/${bareWebp}` });
        continue;
      }
    }

    // Fallback: check if webp file exists on disk via lookup (handles renames)
    if (webpOnDisk.has(base)) {
      const diskFile = webpOnDisk.get(base);
      replacements.push({ from: url, to: `${imagesDirWeb}/${diskFile}` });
      continue;
    }

    // No .webp found - log and skip
    skippedImages++;
    console.warn(`  [skip] No .webp for: ${url}`);
    console.warn(`         Expected: ${path.join(config.imagesDir, webpFile)}`);
  }

  if (skippedImages > 0) {
    console.warn(`\n  ${skippedImages} image URL(s) skipped (no .webp file found).`);
    console.warn('  Run "npx img-opt download" then "npx img-opt compress" first.\n');
  }

  // ── Local image extension replacements in imagesDir (.png/.jpg → .webp)
  const webpBases = new Set();
  if (fs.existsSync(imagesDir)) {
    for (const f of fs.readdirSync(imagesDir)) {
      if (f.toLowerCase().endsWith('.webp')) {
        webpBases.add(path.basename(f, '.webp'));
      }
    }
  }
  for (const base of webpBases) {
    if (shouldIgnore(base)) continue;
    replacements.push({ from: `${imagesDirWeb}/${base}.png`, to: `${imagesDirWeb}/${base}.webp` });
    replacements.push({ from: `${imagesDirWeb}/${base}.jpg`, to: `${imagesDirWeb}/${base}.webp` });
    replacements.push({ from: `${imagesDirWeb}/${base}.jpeg`, to: `${imagesDirWeb}/${base}.webp` });
  }

  // ── In-place local image replacements (compressLocal) ──────────────
  // Find .webp files across the project that have no .png/.jpg sibling
  // (meaning the original was compressed and removed)
  if (config.compressLocal) {
    const scanDirs = [...new Set([...(config.replaceInDirs || ['src']), 'public'])];
    const webpFiles = [];
    for (const d of scanDirs) {
      walkDir(path.join(projectRoot, d), ['.webp'], webpFiles);
    }
    for (const webpPath of webpFiles) {
      // Skip files in imagesDir (already handled above)
      if (webpPath.startsWith(imagesDir + path.sep) || webpPath.startsWith(imagesDir + '/')) continue;

      const dir = path.dirname(webpPath);
      const base = path.basename(webpPath, '.webp');
      const relDir = path.relative(projectRoot, dir).replace(/\\/g, '/');
      // Build relative web paths for this location
      const localWebBase = '/' + (relDir.replace(/^public\/?/, '') || '');
      const prefix = localWebBase === '/' ? '/' : localWebBase + '/';

      for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.bmp']) {
        const oldRef = `${prefix}${base}${ext}`;
        const newRef = `${prefix}${base}.webp`;
        if (oldRef !== newRef && !shouldIgnore(oldRef)) {
          replacements.push({ from: oldRef, to: newRef });
        }
      }
      // Also handle relative paths without leading slash (e.g. ./assets/hero.png)
      for (const ext of ['.png', '.jpg', '.jpeg', '.gif', '.bmp']) {
        const oldRef = `./${relDir}/${base}${ext}`;
        const newRef = `./${relDir}/${base}.webp`;
        if (oldRef !== newRef && !shouldIgnore(oldRef)) {
          replacements.push({ from: oldRef, to: newRef });
        }
      }
    }
  }

  // ── Video source URL replacements ──────────────────────────────────
  let skippedVideos = 0;
  for (const { url, file } of videoSources) {
    const base = path.basename(file, path.extname(file));
    const webmFile = `${base}.webm`;
    if (fs.existsSync(path.join(videosDir, webmFile))) {
      replacements.push({ from: url, to: `${videosDirWeb}/${webmFile}` });
    } else {
      skippedVideos++;
      console.warn(`  [skip] No .webm for: ${url}`);
      console.warn(`         Expected: ${path.join(config.videosDir, webmFile)}`);
    }
  }
  if (skippedVideos > 0) {
    console.warn(`\n  ${skippedVideos} video URL(s) skipped (no .webm file found).\n`);
  }

  // ── Local video extension replacements in videosDir (.mp4/.mov → .webm)
  const webmBases = new Set();
  if (fs.existsSync(videosDir)) {
    for (const f of fs.readdirSync(videosDir)) {
      if (f.toLowerCase().endsWith('.webm')) {
        webmBases.add(path.basename(f, '.webm'));
      }
    }
  }
  for (const base of webmBases) {
    if (shouldIgnore(base)) continue;
    for (const ext of ['.mp4', '.mov', '.avi', '.mkv', '.m4v']) {
      replacements.push({ from: `${videosDirWeb}/${base}${ext}`, to: `${videosDirWeb}/${base}.webm` });
    }
  }

  // ── In-place local video replacements (compressLocal) ──────────────
  if (config.compressLocal) {
    const scanDirs = [...new Set([...(config.replaceInDirs || ['src']), 'public'])];
    const webmFiles = [];
    for (const d of scanDirs) {
      walkDir(path.join(projectRoot, d), ['.webm'], webmFiles);
    }
    for (const webmPath of webmFiles) {
      if (webmPath.startsWith(videosDir + path.sep) || webmPath.startsWith(videosDir + '/')) continue;

      const dir = path.dirname(webmPath);
      const base = path.basename(webmPath, '.webm');
      const relDir = path.relative(projectRoot, dir).replace(/\\/g, '/');
      const localWebBase = '/' + (relDir.replace(/^public\/?/, '') || '');
      const prefix = localWebBase === '/' ? '/' : localWebBase + '/';

      for (const ext of ['.mp4', '.mov', '.avi', '.mkv', '.m4v']) {
        const oldRef = `${prefix}${base}${ext}`;
        const newRef = `${prefix}${base}.webm`;
        if (oldRef !== newRef && !shouldIgnore(oldRef)) {
          replacements.push({ from: oldRef, to: newRef });
        }
      }
      for (const ext of ['.mp4', '.mov', '.avi', '.mkv', '.m4v']) {
        const oldRef = `./${relDir}/${base}${ext}`;
        const newRef = `./${relDir}/${base}.webm`;
        if (oldRef !== newRef && !shouldIgnore(oldRef)) {
          replacements.push({ from: oldRef, to: newRef });
        }
      }
    }
  }

  // ── Scan files and apply replacements ──────────────────────────────
  const exts = config.replaceExtensions || ['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte', '.md', '.mdx'];
  const dirs = (config.replaceInDirs || ['src']).map((d) => path.join(projectRoot, d));
  const allFiles = [];
  for (const d of dirs) {
    walkDir(d, exts, allFiles);
  }

  if (replacements.length === 0) {
    console.log('No replacements to apply. Check warnings above for details.');
    return;
  }

  let totalReplaced = 0;
  let filesChanged = 0;
  for (const filePath of allFiles) {
    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;
    const fileReplacements = [];
    for (const { from, to } of replacements) {
      if (from === to) continue;
      const count = (content.match(new RegExp(escapeRegex(from), 'g')) || []).length;
      if (count) {
        content = content.split(from).join(to);
        changed = true;
        totalReplaced += count;
        fileReplacements.push({ from, to, count });
      }
    }
    if (changed) {
      const relPath = path.relative(projectRoot, filePath);
      if (DRY_RUN) {
        console.log(`[dry-run] Would update: ${relPath}`);
        for (const { from, to, count } of fileReplacements) {
          console.log(`  ${count}x: ${from.length > 80 ? from.substring(0, 77) + '...' : from}`);
          console.log(`     → ${to}`);
        }
      } else {
        fs.writeFileSync(filePath, content);
        console.log('Updated:', relPath);
      }
      filesChanged++;
    }
  }

  const verb = DRY_RUN ? 'Would replace' : 'Replaced';
  console.log(`\nDone. ${verb} ${totalReplaced} URL(s) in ${filesChanged} file(s) (scanned ${allFiles.length} files).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
