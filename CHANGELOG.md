# Changelog

All notable changes to `img-opt` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [2.1.1] - 2026-03-26

### Fixed
- **replace.js now auto-scans** - when no `sources` config exists, replace runs the scanner to discover the URL→file mapping, so external URLs are correctly rewritten to local `.webp`/`.webm` paths
- **scan.js detects URLs without file extensions** - URLs in image contexts (`<img src>`, CSS `url()`, markdown `![]()`) are now classified as images even without a `.png`/`.jpg` extension (e.g. Unsplash URLs like `photo-123?w=1920`)
- URL patterns now use context-aware matching: `<img>` → image, `<video>` → video, `url()` → image
- replace.js only creates replacements when the `.webp`/`.webm` file actually exists on disk

## [2.1.0] - 2026-03-26

### Added
- **Local compression**: automatically finds and compresses uncompressed PNG/JPG/MP4 files anywhere in the project, not just downloaded assets (`compressLocal: true` by default)
- **Ignore patterns**: skip specific URLs or file paths from scanning, downloading, and compression via `ignore: ['pattern', '/regex/']` config option
- Shared `ignore.js` helper supporting both substring and regex patterns

### Changed
- `compress.js` now scans `replaceInDirs` + `public/` for local uncompressed images (skips files with existing .webp sibling)
- `video-compress.js` now scans for local uncompressed videos the same way
- `replace.js` handles in-place path rewrites for locally compressed assets (both absolute and relative paths)
- All modules respect the `ignore` config - ignored URLs are skipped in scan, download, and compression

## [2.0.0] - 2026-03-26

### Added
- **Auto-scan**: automatically discovers external image and video URLs in your codebase - no manual `sources` config needed
- New command: `npx img-opt scan` reports found external URLs without downloading
- **Video support**: download, compress to WebM (via ffmpeg), and rewrite video URLs
- New command: `npx img-opt video` for video-only compression
- New config options: `autoScan`, `videosDir`, `videoCompress`, `videoSources`
- Config file is now optional - sensible defaults used when absent
- Shared `walkDir` utility skips `node_modules`, `.git`, `dist`, `build`, etc.
- `.css` and `.astro` added to default scan extensions

### Changed
- `sources` config is now optional (auto-scan kicks in when empty)
- `run-all` pipeline now includes video compression as step 3/4
- Pipeline: download → compress images → compress videos → replace URLs
- Version bumped to 2.0.0

## [1.0.0] - 2025-03-22

### Added
- Full pipeline: download → compress → replace in one command (`npx img-opt`)
- Individual step commands: `img-opt download`, `img-opt compress`, `img-opt replace`
- `image-assets.config.js` config file for defining image sources, output directory, and compression settings
- WebP conversion via optional `sharp` peer dependency
- Configurable quality, output format, and `removeOriginals` flag
- URL replacement in all source files (`src/**/*.{js,jsx,ts,tsx,vue,svelte,html,astro,mdx}`)
- Works with Vite, Next.js, Astro, SvelteKit, Nuxt
- Node.js 18+ ESM package
