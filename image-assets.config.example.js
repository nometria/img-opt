/**
 * image-assets.config.js - copy this to your project root (optional).
 *
 * img-opt works with ZERO config - it auto-scans your codebase for external
 * image and video URLs. Use this file only to override defaults.
 *
 * img-opt looks for this file in (in order):
 *   $IMAGE_ASSETS_CONFIG env var
 *   scripts/image-assets.config.js
 *   image-assets.config.js  (project root)
 */

export default {
  /** Auto-scan codebase for external image/video URLs when sources is empty (default: true) */
  autoScan: true,

  /** Also compress local uncompressed images/videos found in the project (default: true) */
  compressLocal: true,

  /** Patterns to ignore - substring match or /regex/. Applied to URLs and file paths. */
  ignore: [
    // 'cdn.dynamic-api.com',
    // '/user-avatar-\\d+/',
  ],

  /** Directory where images are saved, relative to project root */
  imagesDir: 'public/images',

  /** Directory where videos are saved, relative to project root */
  videosDir: 'public/videos',

  /** Directories to scan for URL replacement */
  replaceInDirs: ['src'],

  /** File extensions to scan when rewriting URLs */
  replaceExtensions: ['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte', '.md', '.mdx', '.css', '.astro'],

  /** Image compression settings (requires sharp: npm i -D sharp) */
  compress: {
    format: 'webp',        // 'webp' | 'avif' | 'jpeg' | 'png'
    quality: 82,
    // effort: 4,          // webp/avif only: 0-6, higher = smaller but slower
    removeOriginals: true,
  },

  /** Video compression settings (requires ffmpeg installed) */
  videoCompress: {
    format: 'webm',
    quality: 'good',       // 'fast' | 'good' | 'best'
    maxWidth: 1920,
    removeOriginals: true,
  },

  /** External images to download (optional - auto-scanned if empty) */
  sources: [
    // { url: 'https://example.com/hero.png',   file: 'hero.png' },
    // { url: 'https://example.com/logo.jpg',   file: 'logo.jpg' },
  ],

  /** External videos to download (optional - auto-scanned if empty) */
  videoSources: [
    // { url: 'https://example.com/demo.mp4',   file: 'demo.mp4' },
  ],
};
