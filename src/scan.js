#!/usr/bin/env node
/**
 * scan.js - auto-discover external image and video URLs in the codebase.
 * Replaces the manual `sources` config for most projects.
 *
 * Usage:
 *   npx img-opt scan            # report found URLs
 *   import { scanForUrls } from '@nometria-ai/img-opt/scan'
 */

import fs from 'fs';
import path from 'path';
import { getConfig } from './lib/get-config.js';
import { walkDir } from './lib/walk-dir.js';
import { buildIgnoreFilter } from './lib/ignore.js';

// ── Extensions ──────────────────────────────────────────────────────────
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'ico']);
const VIDEO_EXTS = new Set(['mp4', 'mov', 'avi', 'webm', 'mkv', 'm4v']);

// ── URL extraction patterns ─────────────────────────────────────────────
// Each pattern has a capture group for the URL and an optional context hint.
// context: 'image' means the URL is in an image context (img src, css url, markdown image)
//          'video' means video context (<video src, <source src)
//          'media' means either (poster, data-src)
//          undefined means no context hint - rely on extension matching only
const URL_PATTERNS = [
  // <img src="...">, <Image src="..."> - image context
  { rx: /<(?:img|Image)\s[^>]*?src\s*=\s*["'](https?:\/\/[^"'\s>]+)/gi, context: 'image' },

  // <video src="...">, <source src="..."> - video context
  { rx: /<(?:video|source)\s[^>]*?src\s*=\s*["'](https?:\/\/[^"'\s>]+)/gi, context: 'video' },

  // Generic src="...", poster="...", data-src="..." - media context
  { rx: /(?:src|poster|data-src)\s*=\s*["'](https?:\/\/[^"'\s>]+)/gi, context: 'media' },

  // srcset entries
  { rx: /srcset\s*=\s*["']([^"']+)/gi, context: 'image' },

  // CSS url(...) - image context (backgrounds, etc.)
  { rx: /url\(\s*["']?(https?:\/\/[^"')\s]+)/gi, context: 'image' },

  // Markdown images: ![alt](url) - image context
  { rx: /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/gi, context: 'image' },

  // Bare string literals with known asset extensions - no context hint
  { rx: /["'`](https?:\/\/[^"'`\s]+\.(?:png|jpe?g|gif|svg|webp|avif|bmp|ico|mp4|mov|avi|webm|mkv|m4v)(?:\?[^"'`\s]*)?)/gi, context: undefined },
];

// ── Helpers ─────────────────────────────────────────────────────────────

/** Extract the file extension (without dot, lowercased) from a URL. */
function urlExtension(url) {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase().replace('.', '');
    return ext;
  } catch {
    const match = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
    return match ? match[1].toLowerCase() : '';
  }
}

/** Derive a filesystem-safe filename from a URL. */
export function urlToFilename(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    // Take last path segment
    let name = pathname.split('/').filter(Boolean).pop() || 'asset';
    // Remove query string that might have leaked in
    name = name.split('?')[0];
    // Sanitize: keep alphanumeric, dots, hyphens, underscores
    name = name.replace(/[^a-zA-Z0-9._-]/g, '-');
    // Collapse multiple hyphens
    name = name.replace(/-{2,}/g, '-');
    // Ensure it has an extension - guess from query or default
    if (!path.extname(name)) {
      const ext = urlExtension(url);
      name += ext ? `.${ext}` : '.png';
    }
    return name;
  } catch {
    return 'asset.png';
  }
}

/** Parse srcset attribute value into individual URLs */
function parseSrcset(srcsetValue) {
  return srcsetValue
    .split(',')
    .map((entry) => entry.trim().split(/\s+/)[0])
    .filter((url) => /^https?:\/\//.test(url));
}

/**
 * Scan the codebase for external image and video URLs.
 *
 * @param {Object} options
 * @param {string} options.projectRoot - absolute path to project root
 * @param {string[]} options.scanDirs - directories to scan (relative to root)
 * @param {string[]} options.scanExtensions - file extensions to read
 * @param {string[]} [options.ignore] - patterns to ignore (substrings or /regex/)
 * @returns {{ images: {url: string, file: string, foundIn: string[]}[], videos: {url: string, file: string, foundIn: string[]}[] }}
 */
export async function scanForUrls({ projectRoot, scanDirs, scanExtensions, ignore = [] }) {
  const shouldIgnore = buildIgnoreFilter(ignore);
  const dirs = scanDirs.map((d) => path.join(projectRoot, d));
  const allFiles = [];
  for (const d of dirs) {
    walkDir(d, scanExtensions, allFiles);
  }

  // Map<url, { file, foundIn: Set, type: 'image'|'video' }>
  const urlMap = new Map();
  const usedFilenames = new Map(); // filename → count (for dedup)

  for (const filePath of allFiles) {
    const content = fs.readFileSync(filePath, 'utf8');
    const relPath = path.relative(projectRoot, filePath);

    for (const { rx: pattern, context } of URL_PATTERNS) {
      // Reset regex state
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const captured = match[1];
        // Handle srcset: may contain multiple URLs
        const urls = pattern.source.includes('srcset')
          ? parseSrcset(captured)
          : [captured];

        for (const rawUrl of urls) {
          // Clean up the URL
          const url = rawUrl.replace(/['"`;,)\s]+$/, '');
          if (!url || url.length < 10) continue;

          // Skip data URIs, relative URLs, localhost, ignored patterns
          if (/^data:/i.test(url)) continue;
          if (!/^https?:\/\//i.test(url)) continue;
          if (/localhost|127\.0\.0\.1/i.test(url)) continue;
          if (shouldIgnore(url)) continue;

          // Classify as image or video
          const ext = urlExtension(url);
          let type;
          if (IMAGE_EXTS.has(ext)) type = 'image';
          else if (VIDEO_EXTS.has(ext)) type = 'video';
          else if (context === 'image') type = 'image';   // context hint (e.g. <img>, css url())
          else if (context === 'video') type = 'video';   // context hint (e.g. <video>)
          else if (context === 'media') type = 'image';   // default media context → image
          else continue; // no extension AND no context → skip

          if (urlMap.has(url)) {
            urlMap.get(url).foundIn.add(relPath);
          } else {
            let filename = urlToFilename(url);
            // Deduplicate filenames
            if (usedFilenames.has(filename)) {
              const count = usedFilenames.get(filename) + 1;
              usedFilenames.set(filename, count);
              const extPart = path.extname(filename);
              const basePart = path.basename(filename, extPart);
              filename = `${basePart}-${count}${extPart}`;
            } else {
              usedFilenames.set(filename, 1);
            }

            urlMap.set(url, { file: filename, foundIn: new Set([relPath]), type });
          }
        }
      }
    }
  }

  const images = [];
  const videos = [];

  for (const [url, entry] of urlMap) {
    const result = { url, file: entry.file, foundIn: [...entry.foundIn] };
    if (entry.type === 'image') images.push(result);
    else videos.push(result);
  }

  return { images, videos };
}

// ── CLI entry (only runs when this file is executed directly) ────────────
async function main() {
  const { config, projectRoot } = await getConfig();

  console.log('Scanning codebase for external image and video URLs...\n');

  const { images, videos } = await scanForUrls({
    projectRoot,
    scanDirs: config.replaceInDirs,
    scanExtensions: config.replaceExtensions,
    ignore: config.ignore,
  });

  if (!images.length && !videos.length) {
    console.log('No external image or video URLs found.');
    return;
  }

  if (images.length) {
    console.log(`Images (${images.length}):`);
    for (let i = 0; i < images.length; i++) {
      const { url, file, foundIn } = images[i];
      console.log(`  ${i + 1}. ${url}`);
      console.log(`     -> ${file}  (${foundIn.join(', ')})`);
    }
    console.log();
  }

  if (videos.length) {
    console.log(`Videos (${videos.length}):`);
    for (let i = 0; i < videos.length; i++) {
      const { url, file, foundIn } = videos[i];
      console.log(`  ${i + 1}. ${url}`);
      console.log(`     -> ${file}  (${foundIn.join(', ')})`);
    }
    console.log();
  }

  console.log(`Total: ${images.length} image(s), ${videos.length} video(s)`);
  console.log('\nRun `npx img-opt` to download and optimize all found assets.');
}

// Only run CLI main() when this file is executed directly (not when imported).
import { fileURLToPath as _fileURLToPath } from 'url';
const _thisFile = _fileURLToPath(import.meta.url);
const _entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (_thisFile === _entryFile) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
