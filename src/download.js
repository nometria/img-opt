#!/usr/bin/env node
/**
 * Download external images (and videos) from config or auto-scan results.
 * Run from project root: npx img-opt download
 */

import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { getConfig } from './lib/get-config.js';
import { scanForUrls } from './scan.js';
import { buildIgnoreFilter } from './lib/ignore.js';

function download(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const req = protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageDownloader/1.0)' } }, (res) => {
      const redirect = res.headers.location;
      if (redirect && (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307)) {
        res.resume();
        return download(redirect).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ data: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
  });
}

async function downloadList(sources, outDir, label) {
  if (!sources.length) return;

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log(`Downloading ${sources.length} ${label}(s) to ${path.relative(process.cwd(), outDir)}/\n`);

  for (const { url, file } of sources) {
    const outPath = path.join(outDir, file);
    if (fs.existsSync(outPath)) {
      console.log(`  Skipping ${file} (already exists)`);
      continue;
    }
    try {
      process.stdout.write(`  Downloading ${file}... `);
      const { data } = await download(url);
      fs.writeFileSync(outPath, data);
      console.log(`OK (${(data.length / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }
}

async function main() {
  const { config, projectRoot } = await getConfig();

  const shouldIgnore = buildIgnoreFilter(config.ignore);

  let imageSources = (config.sources || []).filter((s) => !shouldIgnore(s.url));
  let videoSources = (config.videoSources || []).filter((s) => !shouldIgnore(s.url));

  // Auto-scan if no sources configured
  if (!imageSources.length && !videoSources.length && config.autoScan) {
    console.log('No sources configured - scanning codebase for external URLs...\n');
    const scanResult = await scanForUrls({
      projectRoot,
      scanDirs: config.replaceInDirs,
      scanExtensions: config.replaceExtensions,
      ignore: config.ignore,
    });
    imageSources = scanResult.images;
    videoSources = scanResult.videos;

    if (!imageSources.length && !videoSources.length) {
      console.log('No external image or video URLs found in codebase.');
      return;
    }
    console.log(`Found ${imageSources.length} image(s) and ${videoSources.length} video(s)\n`);
  }

  if (!imageSources.length && !videoSources.length) {
    console.log('No sources in config and autoScan is disabled. Add sources to image-assets.config.js or set autoScan: true.');
    return;
  }

  // Download images
  if (imageSources.length) {
    const imageDir = path.join(projectRoot, config.imagesDir);
    await downloadList(imageSources, imageDir, 'image');
    console.log(`\nImages saved to ${config.imagesDir}/`);
  }

  // Download videos
  if (videoSources.length) {
    const videoDir = path.join(projectRoot, config.videosDir);
    await downloadList(videoSources, videoDir, 'video');
    console.log(`\nVideos saved to ${config.videosDir}/`);
  }

  console.log('\nDownload complete.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
