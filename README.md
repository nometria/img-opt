# img-opt

Built by the [Nometria](https://nometria.com) team. We help developers take apps built with AI tools (Lovable, Bolt, Base44, Replit) to production — handling deployment to AWS, security, scaling, and giving you full code ownership. [Learn more →](https://nometria.com)

[![npm version](https://img.shields.io/npm/v/%40nometria-ai%2Fimg-opt.svg)](https://www.npmjs.com/package/@nometria-ai/img-opt)
[![npm downloads](https://img.shields.io/npm/dm/%40nometria-ai%2Fimg-opt.svg)](https://www.npmjs.com/package/@nometria-ai/img-opt)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Auto-scan your codebase for external images & videos, compress to WebP/WebM, rewrite all URLs. Zero config.

Eliminates external media dependencies, cuts image payload by 60-80%, compresses videos to WebM, and updates every URL reference in your source automatically. Works with Vite, Next.js, Astro, Vue, and Svelte projects.

---

## Quick start

```bash
# Install
npm install --save-dev @nometria-ai/img-opt sharp

# Run — that's it. No config file needed.
npx img-opt
```

img-opt auto-scans your `src/` directory for external image and video URLs, downloads them, compresses images to WebP and videos to WebM, then rewrites every URL reference.

---

## What's new in v2.1

- **GIF and BMP compression** — `.gif` and `.bmp` files are now compressed to WebP alongside PNG/JPG.
- **Parallel processing** — image compression runs in parallel (configurable concurrency, default 4) for faster builds.
- **Smart skip** — if WebP output would be larger than the original (common with high-quality JPEGs), the original is kept.
- **Configurable effort** — tune the WebP effort level for better compression vs speed tradeoffs.
- **Compression ratio in output** — see exactly how much each image was reduced.

---

## Install

```bash
# As a dev dependency (recommended)
npm install --save-dev @nometria-ai/img-opt sharp

# For video compression, install ffmpeg:
# macOS:   brew install ffmpeg
# Ubuntu:  sudo apt install ffmpeg
# Windows: choco install ffmpeg
```

> `sharp` is a peer dependency for image compression. `ffmpeg` is a system dependency for video compression. Both are optional — the pipeline skips steps gracefully if they're missing.

---

## Commands

```bash
npx img-opt                # full pipeline (scan → download → compress → replace)
npx img-opt scan           # discover external image/video URLs (dry-run)
npx img-opt download       # fetch external images + videos
npx img-opt compress       # convert PNG/JPG/GIF/BMP → WebP via Sharp
npx img-opt video          # convert MP4/MOV → WebM via ffmpeg
npx img-opt replace        # rewrite external URLs in source files
```

Add to `package.json` scripts:

```json
{
  "scripts": {
    "optimize": "img-opt",
    "optimize:scan": "img-opt scan"
  }
}
```

---

## How it works

### Auto-scan (new in v2.0)

When no `sources` are configured, img-opt scans your codebase and detects:

- `<img src="https://...">` and `<Image src="...">` (React, Next.js)
- `<video src="...">`, `<source src="...">`, `poster="..."`
- CSS `url(https://...)`
- Markdown `![alt](https://...)`
- String literals containing image/video URLs (`.png`, `.jpg`, `.mp4`, etc.)
- `srcset` attribute entries

Run `npx img-opt scan` to preview what will be found before downloading.

### Local asset compression

Even without external URLs, img-opt compresses **local** uncompressed images and videos already in your project. It scans `src/`, `public/`, and any configured `replaceInDirs` for `.png`, `.jpg`, `.gif`, `.bmp`, `.mp4`, etc., compresses them in place, and rewrites all references.

This means dropping a `.png` into `src/assets/` and running `npx img-opt` will automatically convert it to `.webp` and update your imports. Set `compressLocal: false` to disable.

### Ignore patterns

Use the `ignore` config to skip certain URLs or file paths:

```js
export default {
  ignore: [
    'cdn.dynamic-api.com',        // skip any URL containing this string
    '/user-avatar-\\d+/',         // regex: skip dynamic avatar URLs
    'src/assets/brand-logo',      // skip a specific local file
  ],
};
```

Ignored items are excluded from scanning, downloading, and compression.

### Pipeline

1. **Scan** — auto-discovers external image and video URLs in your source files
2. **Download** — fetches each URL (follows redirects), saves to `public/images/` and `public/videos/`
3. **Compress images** — converts PNG/JPG/GIF/BMP to WebP at configured quality using Sharp
4. **Compress videos** — converts MP4/MOV/AVI to WebM using ffmpeg (VP9 + Opus)
5. **Replace** — rewrites all URLs in source files (`.png` → `.webp`, `.mp4` → `.webm`, external URLs → local paths)

---

## Configuration (optional)

Create `image-assets.config.js` in your project root to override defaults:

```js
export default {
  autoScan: true,                    // scan codebase for URLs (default: true)
  compressLocal: true,               // compress local uncompressed assets too (default: true)
  imagesDir: 'public/images',       // where to save downloaded images
  videosDir: 'public/videos',       // where to save downloaded videos
  replaceInDirs: ['src'],           // directories to scan
  compress: {
    format: 'webp',
    quality: 82,
    effort: undefined,              // WebP effort 0-6 (higher = smaller but slower)
    concurrency: 4,                 // parallel compression threads
    removeOriginals: true,
  },
  videoCompress: {
    format: 'webm',
    quality: 'good',                // 'fast' | 'good' | 'best'
    maxWidth: 1920,
    removeOriginals: true,
  },
  // Skip certain URLs or file paths
  ignore: [
    // 'cdn.dynamic-api.com',       // substring match
    // '/avatar-\\d+/',             // regex match
  ],
  // Manual sources (optional — auto-scanned if empty)
  sources: [],
  videoSources: [],
};
```

### Configuration options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `autoScan` | boolean | `true` | Auto-discover external URLs when sources is empty |
| `compressLocal` | boolean | `true` | Also compress local uncompressed images/videos in the project |
| `ignore` | string[] | `[]` | Patterns to skip (substring or `/regex/`). Applied to URLs and file paths |
| `imagesDir` | string | `'public/images'` | Directory where images are saved |
| `videosDir` | string | `'public/videos'` | Directory where videos are saved |
| `replaceInDirs` | string[] | `['src']` | Directories scanned for URL replacement |
| `replaceExtensions` | string[] | see below | File extensions to scan |
| `compress.format` | `'webp'` \| `'jpeg'` \| `'png'` | `'webp'` | Output image format |
| `compress.quality` | number | `82` | Image compression quality (1-100) |
| `compress.effort` | number | `undefined` | WebP effort level (0-6). Higher = smaller files but slower. Default uses Sharp's default (4) |
| `compress.concurrency` | number | `4` | Number of images to compress in parallel |
| `compress.removeOriginals` | boolean | `true` | Delete source files after converting |
| `videoCompress.format` | string | `'webm'` | Output video format |
| `videoCompress.quality` | `'fast'` \| `'good'` \| `'best'` | `'good'` | Video quality preset |
| `videoCompress.maxWidth` | number | `1920` | Scale down videos wider than this |
| `videoCompress.removeOriginals` | boolean | `true` | Delete source video after converting |
| `sources` | Array | `[]` | Manual `{ url, file }` list (auto-scanned if empty) |
| `videoSources` | Array | `[]` | Manual `{ url, file }` list (auto-scanned if empty) |

Default `replaceExtensions`: `.js, .jsx, .ts, .tsx, .html, .vue, .svelte, .md, .mdx, .css, .astro`

---

## Benchmarks

### Kodak Dataset (Industry Standard)

Evaluated on the [Kodak Lossless True Color Image Suite](http://r0k.us/graphics/kodak/) — the standard benchmark used by [Google's WebP study](https://developers.google.com/speed/webp/docs/webp_study), academic papers, and competing tools. Quality measured using SSIM (Structural Similarity Index), the industry-standard perceptual quality metric.

| Metric | Value |
|--------|-------|
| **Average SSIM** | **0.9677** (range: 0.9489–0.9846) |
| **Average size reduction** | **89.9%** (626 KB → 63 KB) |
| **Average BPP** | 13.05 → 1.32 |
| Dataset | 24 images, 768×512, lossless PNG |
| Quality setting | WebP q=82 (default) |

SSIM > 0.95 is considered high quality; > 0.99 is near-lossless. Our average of 0.9677 indicates excellent perceptual quality with aggressive compression.

**Reference (Google WebP study):** WebP is 25–34% smaller than JPEG at equivalent SSIM, tested on Kodak, Tecnick, and Lenna datasets.

Run the Kodak benchmark yourself:

```bash
node benchmarks/download-kodak.js   # download 24 Kodak images (one-time)
node benchmarks/kodak-benchmark.js  # run SSIM + compression benchmarks
```

### Synthetic benchmarks

Measured with Sharp 0.34 on Node.js v25, Apple Silicon. Run `npm test` to reproduce.

### Compression ratio (quality=82)

| Image type | Size | Input | Output | Reduction |
|------------|------|-------|--------|-----------|
| JPEG (small, 320x240) | 16 KB | JPEG | WebP | **53%** |
| JPEG (medium, 800x600) | 61 KB | JPEG | WebP | **40%** |
| JPEG (large, 1920x1080) | 401 KB | JPEG | WebP | **51%** |
| JPEG (4K, 3840x2160) | 1.9 MB | JPEG | WebP | **56%** |
| PNG (small, 320x240) | 223 KB | PNG | WebP | **96%** |
| PNG (medium, 800x600) | 1.3 MB | PNG | WebP | **96%** |
| PNG (large, 1920x1080) | 5.6 MB | PNG | WebP | **96%** |
| GIF (small, 320x240) | 43 KB | GIF | WebP | **79%** |
| GIF (medium, 800x600) | 178 KB | GIF | WebP | **68%** |

**Average reduction:** JPEG 50%, PNG 96%, GIF 73%

### Quality vs file size (800x600 JPEG)

| Quality | Output size | Reduction | Notes |
|---------|-------------|-----------|-------|
| q=50 | 6.5 KB | 89% | Noticeable artifacts |
| q=65 | 11 KB | 81% | Good for thumbnails |
| q=75 | 17 KB | 73% | Balanced |
| **q=82** | **36 KB** | **40%** | **Default — best quality/size tradeoff** |
| q=90 | 69 KB | -13% | Larger than original JPEG |
| q=95 | 114 KB | -87% | Much larger — smart skip kicks in |

### WebP effort level (1920x1080 JPEG)

| Effort | Output | Reduction | Time | Notes |
|--------|--------|-----------|------|-------|
| 0 | 192 KB | 52% | 46 ms | Fastest |
| 2 | 201 KB | 50% | 79 ms | |
| **4** | **197 KB** | **51%** | **171 ms** | **Sharp default** |
| 6 | 168 KB | 58% | 353 ms | Best compression, 7.7x slower |

### Throughput

| Mode | Images/sec | Notes |
|------|-----------|-------|
| Sequential | ~34 img/s | Small/medium images |
| Parallel (c=4) | ~9 img/s | All sizes including 4K; 1.6x faster than sequential |

---

## Supported frameworks

Works with any framework that serves a `public/` directory:

| Framework | Config `imagesDir` | Config `replaceInDirs` |
|-----------|-------------------|----------------------|
| Vite / Vue | `public/images` | `['src']` |
| Next.js | `public/images` | `['app', 'pages', 'components']` |
| Astro | `public/images` | `['src']` |
| Svelte | `public/images` | `['src']` |
| Plain HTML | `images` | `['.']` |

---

## CI integration

Run as part of your build:

```yaml
# .github/workflows/build.yml
- name: Optimize assets
  run: npx img-opt
```

---

## Typical results

| Metric | Before | After |
|--------|--------|-------|
| External requests at load | 8-12 | 0 |
| Image payload | 2.4 MB | 480 KB |
| Video payload | 15 MB | 4 MB |
| Largest Contentful Paint | 3.1 s | 1.2 s |

---

## Troubleshooting

### URLs not being replaced

Run the replace step with `--dry-run` to see what would happen without modifying files:

```bash
npx img-opt replace --dry-run
```

Common causes:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `[skip] No .webp for: <url>` | Image was not downloaded or compressed | Run `npx img-opt download` then `npx img-opt compress` |
| `No replacements to apply` | No `.webp` files in `public/images/` | Run the full pipeline: `npx img-opt` |
| `Replaced 0 URL(s)` | URLs were mapped but not found in source files | Check `replaceInDirs` includes your source directories |
| Scanned 0 files | `replaceInDirs` doesn't match your project structure | Set `replaceInDirs` in `image-assets.config.js` (e.g. `['app', 'pages', 'components']` for Next.js) |

### URLs with query parameters (e.g. Unsplash)

URLs like `https://images.unsplash.com/photo-123?w=1920&q=80` are handled automatically. The scanner captures the full URL including query params, and the replacer matches the exact string in your source files. If replacement fails, use `--dry-run` to verify the URL is being detected and the `.webp` file exists.

### Debugging the pipeline

Run each step individually to isolate issues:

```bash
npx img-opt scan        # 1. verify URLs are detected
npx img-opt download    # 2. verify images download
npx img-opt compress    # 3. verify .webp files are created
npx img-opt replace --dry-run  # 4. preview replacements
npx img-opt replace     # 5. apply replacements
```

---

## Contributing

PRs welcome. Run tests with `npm test`.

---

## License

MIT - [Nometria](https://nometria.com)
