/**
 * image-assets.config.js - copy this to your project root (optional).
 *
 * img-opt works with ZERO config - it auto-scans your codebase for external
 * image and video URLs. Use this file only if you want to override defaults
 * or manually specify sources.
 *
 * Workflow:
 *   npx img-opt              # full pipeline (auto-scan → download → compress → replace)
 *   npx img-opt scan         # preview what URLs will be found (dry-run)
 *   npx img-opt download     # download images + videos
 *   npx img-opt compress     # compress images to WebP (Sharp)
 *   npx img-opt video        # compress videos to WebM (ffmpeg)
 *   npx img-opt replace      # rewrite URLs in source files
 */

export default {
  /** Auto-scan codebase for external image/video URLs when sources is empty (default: true) */
  autoScan: true,

  /** Also compress local uncompressed images/videos found in the project (default: true) */
  compressLocal: true,

  /**
   * Patterns to ignore - skipped in scan, download, and compression.
   * Strings use substring match, /regex/ patterns use regex match.
   */
  ignore: [
    // 'cdn.dynamic-api.com',       // substring: skip all URLs from this CDN
    // '/user-avatar-\\d+/',        // regex: skip dynamic avatar URLs
    // 'src/assets/brand-logo',     // skip a specific local file path
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
    format: 'webp',
    quality: 82,
    /** Set false to keep original PNG/JPG alongside .webp */
    removeOriginals: true,
  },

  /** Video compression settings (requires ffmpeg installed on system) */
  videoCompress: {
    format: 'webm',
    quality: 'good',       // 'fast' | 'good' | 'best'
    maxWidth: 1920,        // scale down videos wider than this
    removeOriginals: true, // delete original after conversion
  },

  /**
   * External images to download (optional - auto-scanned if empty).
   * After compression, every occurrence of `url` in source files
   * is replaced with `/images/<filename>.webp`.
   */
  sources: [
    // {
    //   url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=1200',
    //   file: 'hero-banner.jpg',
    // },
    // {
    //   url: 'https://cdn.example.com/assets/logo-v3.png',
    //   file: 'logo.png',
    // },
  ],

  /**
   * External videos to download (optional - auto-scanned if empty).
   * After compression, every occurrence of `url` in source files
   * is replaced with `/videos/<filename>.webm`.
   */
  videoSources: [
    // {
    //   url: 'https://cdn.example.com/promo-video.mp4',
    //   file: 'promo.mp4',
    // },
  ],
};
