#!/usr/bin/env node
/**
 * Download the Kodak Lossless True Color Image Suite
 *
 * 24 uncompressed PNG images (768x512), the industry-standard dataset
 * used by Google, academic papers, and competing codecs to benchmark
 * image compression quality and rate-distortion performance.
 *
 * Source: http://r0k.us/graphics/kodak/
 * License: Public domain
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';
import http from 'http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KODAK_DIR = path.join(__dirname, 'kodak');
const IMAGE_COUNT = 24;
const BASE_URL = 'http://r0k.us/graphics/kodak/kodak';

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    proto.get(url, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', (err) => {
      file.close();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(KODAK_DIR, { recursive: true });

  console.log('Kodak Lossless True Color Image Suite');
  console.log('=====================================');
  console.log(`Downloading ${IMAGE_COUNT} images to ${KODAK_DIR}\n`);

  let downloaded = 0;
  let skipped = 0;

  for (let i = 1; i <= IMAGE_COUNT; i++) {
    const name = `kodim${String(i).padStart(2, '0')}.png`;
    const dest = path.join(KODAK_DIR, name);
    const url = `${BASE_URL}/${name}`;

    if (fs.existsSync(dest)) {
      const stat = fs.statSync(dest);
      if (stat.size > 100_000) {
        // Already downloaded (Kodak PNGs are ~500KB-1.2MB each)
        process.stdout.write(`  [skip] ${name} (already exists)\n`);
        skipped++;
        continue;
      }
    }

    process.stdout.write(`  [${i}/${IMAGE_COUNT}] ${name} ... `);
    try {
      await download(url, dest);
      const size = fs.statSync(dest).size;
      console.log(`${(size / 1024).toFixed(0)} KB`);
      downloaded++;
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    }
  }

  console.log(`\nDone: ${downloaded} downloaded, ${skipped} skipped`);

  // Verify
  const files = fs.readdirSync(KODAK_DIR).filter(f => f.endsWith('.png'));
  if (files.length === IMAGE_COUNT) {
    console.log(`All ${IMAGE_COUNT} Kodak images present.`);
  } else {
    console.log(`WARNING: Only ${files.length}/${IMAGE_COUNT} images found.`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
