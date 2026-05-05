#!/usr/bin/env node
/**
 * Kodak Dataset Benchmark — Industry-Standard Image Compression Evaluation
 *
 * Uses the Kodak Lossless True Color Image Suite (24 images, 768x512)
 * to measure WebP compression performance with SSIM quality metrics.
 *
 * This is the same dataset used by:
 *   - Google's WebP study (25-34% smaller than JPEG at equivalent SSIM)
 *   - Academic compression papers (JPEG XL, AVIF, HEIC comparisons)
 *   - Competing tools (cwebp, imagemin, squoosh)
 *
 * Metrics computed:
 *   - SSIM (Structural Similarity Index) — perceptual quality metric
 *   - Compression ratio (original vs WebP)
 *   - Bits per pixel (bpp) — rate-distortion comparison
 *
 * SSIM is computed manually from raw pixel data using 8x8 sliding windows
 * following the Wang et al. (2004) algorithm, avoiding external dependencies.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KODAK_DIR = path.join(__dirname, 'kodak');
const OUTPUT_DIR = path.join(__dirname, 'kodak-output');
const RESULTS_FILE = path.join(__dirname, 'kodak-results.json');

const WEBP_QUALITY = 82; // img-opt default

// ── SSIM Implementation (Wang et al. 2004) ────────────────────────────
//
// SSIM compares luminance, contrast, and structure between two images.
// We use 8x8 non-overlapping windows for speed (standard approach for
// benchmarks; overlapping windows give marginally different absolute
// values but identical relative rankings).
//
// Constants from the original paper:
//   L = 255 (dynamic range for 8-bit images)
//   k1 = 0.01, k2 = 0.03
//   C1 = (k1 * L)^2 = 6.5025
//   C2 = (k2 * L)^2 = 58.5225

const C1 = 6.5025;
const C2 = 58.5225;
const WINDOW_SIZE = 8;

/**
 * Convert RGB pixel buffer to luminance (grayscale) using BT.601 coefficients.
 * Y = 0.299R + 0.587G + 0.114B
 */
function toLuminance(buf, width, height, channels) {
  const lum = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * channels;
    lum[i] = 0.299 * buf[off] + 0.587 * buf[off + 1] + 0.114 * buf[off + 2];
  }
  return lum;
}

/**
 * Compute SSIM between two luminance arrays of the same dimensions.
 * Uses non-overlapping 8x8 windows and returns mean SSIM (MSSIM).
 */
function computeSSIM(lumA, lumB, width, height) {
  const winsX = Math.floor(width / WINDOW_SIZE);
  const winsY = Math.floor(height / WINDOW_SIZE);
  const n = WINDOW_SIZE * WINDOW_SIZE;

  let ssimSum = 0;
  let winCount = 0;

  for (let wy = 0; wy < winsY; wy++) {
    for (let wx = 0; wx < winsX; wx++) {
      const x0 = wx * WINDOW_SIZE;
      const y0 = wy * WINDOW_SIZE;

      // Compute means
      let muA = 0, muB = 0;
      for (let dy = 0; dy < WINDOW_SIZE; dy++) {
        for (let dx = 0; dx < WINDOW_SIZE; dx++) {
          const idx = (y0 + dy) * width + (x0 + dx);
          muA += lumA[idx];
          muB += lumB[idx];
        }
      }
      muA /= n;
      muB /= n;

      // Compute variances and covariance
      let sigmaAA = 0, sigmaBB = 0, sigmaAB = 0;
      for (let dy = 0; dy < WINDOW_SIZE; dy++) {
        for (let dx = 0; dx < WINDOW_SIZE; dx++) {
          const idx = (y0 + dy) * width + (x0 + dx);
          const dA = lumA[idx] - muA;
          const dB = lumB[idx] - muB;
          sigmaAA += dA * dA;
          sigmaBB += dB * dB;
          sigmaAB += dA * dB;
        }
      }
      // Use (n-1) for unbiased sample variance (matches reference implementations)
      sigmaAA /= (n - 1);
      sigmaBB /= (n - 1);
      sigmaAB /= (n - 1);

      // SSIM for this window
      const numerator = (2 * muA * muB + C1) * (2 * sigmaAB + C2);
      const denominator = (muA * muA + muB * muB + C1) * (sigmaAA + sigmaBB + C2);
      ssimSum += numerator / denominator;
      winCount++;
    }
  }

  return ssimSum / winCount;
}

/**
 * Compute SSIM between two image files.
 * Both are decoded to raw RGB pixels, converted to luminance, then compared.
 */
async function computeImageSSIM(originalPath, compressedPath) {
  // Decode original
  const origRaw = await sharp(originalPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Decode compressed (WebP) back to same dimensions
  const compRaw = await sharp(compressedPath)
    .removeAlpha()
    .resize(origRaw.info.width, origRaw.info.height, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = origRaw.info;

  const lumOrig = toLuminance(origRaw.data, width, height, channels);
  const lumComp = toLuminance(compRaw.data, width, height, channels);

  return computeSSIM(lumOrig, lumComp, width, height);
}

// ── Benchmark ─────────────────────────────────────────────────────────

async function main() {
  // Verify Kodak images exist
  if (!fs.existsSync(KODAK_DIR)) {
    console.error('Kodak images not found. Run download-kodak.js first:');
    console.error('  node benchmarks/download-kodak.js');
    process.exit(1);
  }

  const images = fs.readdirSync(KODAK_DIR)
    .filter(f => f.endsWith('.png'))
    .sort();

  if (images.length !== 24) {
    console.error(`Expected 24 Kodak images, found ${images.length}. Re-run download-kodak.js.`);
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('='.repeat(80));
  console.log('Kodak Dataset Benchmark — Industry-Standard Compression Evaluation');
  console.log('='.repeat(80));
  console.log(`Dataset:  Kodak Lossless True Color Image Suite (24 images, 768x512)`);
  console.log(`Encoder:  Sharp (libvips) WebP at quality=${WEBP_QUALITY}`);
  console.log(`Metric:   SSIM (Structural Similarity Index, Wang et al. 2004)`);
  console.log();

  // Header
  console.log(
    'Image'.padEnd(16),
    'Original'.padStart(10),
    'WebP'.padStart(10),
    'Ratio'.padStart(8),
    'BPP-orig'.padStart(10),
    'BPP-webp'.padStart(10),
    'SSIM'.padStart(8),
  );
  console.log('-'.repeat(80));

  const results = [];

  for (const filename of images) {
    const origPath = path.join(KODAK_DIR, filename);
    const webpName = filename.replace('.png', '.webp');
    const webpPath = path.join(OUTPUT_DIR, webpName);

    // Compress to WebP
    await sharp(origPath).webp({ quality: WEBP_QUALITY }).toFile(webpPath);

    // Sizes
    const origSize = fs.statSync(origPath).size;
    const webpSize = fs.statSync(webpPath).size;

    // Get dimensions for BPP
    const meta = await sharp(origPath).metadata();
    const pixels = meta.width * meta.height;

    const bppOrig = (origSize * 8) / pixels;
    const bppWebp = (webpSize * 8) / pixels;
    const ratio = ((1 - webpSize / origSize) * 100);

    // Compute SSIM
    const ssim = await computeImageSSIM(origPath, webpPath);

    console.log(
      filename.padEnd(16),
      formatBytes(origSize).padStart(10),
      formatBytes(webpSize).padStart(10),
      `${ratio.toFixed(1)}%`.padStart(8),
      bppOrig.toFixed(2).padStart(10),
      bppWebp.toFixed(2).padStart(10),
      ssim.toFixed(4).padStart(8),
    );

    results.push({
      image: filename,
      original_bytes: origSize,
      webp_bytes: webpSize,
      reduction_pct: parseFloat(ratio.toFixed(1)),
      bpp_original: parseFloat(bppOrig.toFixed(2)),
      bpp_webp: parseFloat(bppWebp.toFixed(2)),
      ssim: parseFloat(ssim.toFixed(4)),
      width: meta.width,
      height: meta.height,
    });
  }

  // ── Averages ──────────────────────────────────────────────────────────
  console.log('-'.repeat(80));

  const avgSSIM = results.reduce((s, r) => s + r.ssim, 0) / results.length;
  const totalOrig = results.reduce((s, r) => s + r.original_bytes, 0);
  const totalWebp = results.reduce((s, r) => s + r.webp_bytes, 0);
  const avgReduction = (1 - totalWebp / totalOrig) * 100;
  const avgBppOrig = results.reduce((s, r) => s + r.bpp_original, 0) / results.length;
  const avgBppWebp = results.reduce((s, r) => s + r.bpp_webp, 0) / results.length;

  const minSSIM = Math.min(...results.map(r => r.ssim));
  const maxSSIM = Math.max(...results.map(r => r.ssim));

  console.log(
    'AVERAGE'.padEnd(16),
    formatBytes(Math.round(totalOrig / 24)).padStart(10),
    formatBytes(Math.round(totalWebp / 24)).padStart(10),
    `${avgReduction.toFixed(1)}%`.padStart(8),
    avgBppOrig.toFixed(2).padStart(10),
    avgBppWebp.toFixed(2).padStart(10),
    avgSSIM.toFixed(4).padStart(8),
  );

  // ── Summary ───────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`\n  Dataset:              Kodak Lossless True Color (24 images, 768x512)`);
  console.log(`  WebP quality:         ${WEBP_QUALITY}`);
  console.log(`  Average SSIM:         ${avgSSIM.toFixed(4)} (range: ${minSSIM.toFixed(4)} - ${maxSSIM.toFixed(4)})`);
  console.log(`  Average reduction:    ${avgReduction.toFixed(1)}%`);
  console.log(`  Average BPP (orig):   ${avgBppOrig.toFixed(2)}`);
  console.log(`  Average BPP (WebP):   ${avgBppWebp.toFixed(2)}`);
  console.log(`  Total orig size:      ${formatBytes(totalOrig)}`);
  console.log(`  Total WebP size:      ${formatBytes(totalWebp)}`);

  console.log(`\n  Reference (Google WebP study):`);
  console.log(`    WebP is 25-34% smaller than JPEG at equivalent SSIM`);
  console.log(`    Tested on Kodak, Tecnick, and Lenna datasets`);
  console.log(`    SSIM > 0.95 is considered high quality`);
  console.log(`    SSIM > 0.99 is considered near-lossless`);

  // ── Save results ──────────────────────────────────────────────────────
  const summary = {
    dataset: 'Kodak Lossless True Color Image Suite',
    image_count: 24,
    dimensions: '768x512',
    webp_quality: WEBP_QUALITY,
    average_ssim: parseFloat(avgSSIM.toFixed(4)),
    min_ssim: parseFloat(minSSIM.toFixed(4)),
    max_ssim: parseFloat(maxSSIM.toFixed(4)),
    average_reduction_pct: parseFloat(avgReduction.toFixed(1)),
    average_bpp_original: parseFloat(avgBppOrig.toFixed(2)),
    average_bpp_webp: parseFloat(avgBppWebp.toFixed(2)),
    total_original_bytes: totalOrig,
    total_webp_bytes: totalWebp,
    per_image: results,
    timestamp: new Date().toISOString(),
    reference: 'Google WebP study: 25-34% smaller than JPEG at equivalent SSIM',
  };

  fs.writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2));
  console.log(`\n  Results saved to ${RESULTS_FILE}`);

  // Cleanup WebP outputs
  fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

main().catch((err) => { console.error(err); process.exit(1); });
