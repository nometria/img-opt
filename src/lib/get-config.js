/**
 * Resolve image-assets config and project root. Usable from any project.
 * Config path: IMAGE_ASSETS_CONFIG env, or scripts/image-assets.config.js or image-assets.config.js in cwd.
 * Config file is optional - sensible defaults are used when absent (auto-scan kicks in).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
  imagesDir: 'public/images',
  videosDir: 'public/videos',
  replaceInDirs: ['src'],
  replaceExtensions: ['.js', '.jsx', '.ts', '.tsx', '.html', '.vue', '.svelte', '.md', '.mdx', '.css', '.astro'],
  compress: { format: 'webp', quality: 82, effort: undefined, concurrency: 4, removeOriginals: true },
  videoCompress: { format: 'webm', quality: 'good', maxWidth: 1920, removeOriginals: true },
  autoScan: true,
  compressLocal: true,
  ignore: [],
  sources: [],
  videoSources: [],
};

export async function getConfig() {
  const cwd = process.cwd();
  const candidates = [
    process.env.IMAGE_ASSETS_CONFIG,
    path.join(cwd, 'scripts', 'image-assets.config.js'),
    path.join(cwd, 'image-assets.config.js'),
    path.join(__dirname, '..', 'image-assets.config.js'),
  ].filter(Boolean);

  let configPath;
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      configPath = path.resolve(p);
      break;
    }
  }

  // No config file - return defaults (auto-scan will discover assets)
  if (!configPath) {
    return {
      config: { ...DEFAULTS },
      projectRoot: cwd,
      configPath: null,
    };
  }

  const configDir = path.dirname(configPath);
  const projectRoot = path.basename(configDir) === 'scripts' ? path.dirname(configDir) : configDir;
  const mod = await import(configPath);
  const config = (mod.default || mod) ?? {};
  const resolvedRoot = path.resolve(config.projectRoot || projectRoot);

  return {
    config: {
      imagesDir: config.imagesDir ?? DEFAULTS.imagesDir,
      videosDir: config.videosDir ?? DEFAULTS.videosDir,
      replaceInDirs: config.replaceInDirs ?? DEFAULTS.replaceInDirs,
      replaceExtensions: config.replaceExtensions ?? DEFAULTS.replaceExtensions,
      compress: config.compress ?? DEFAULTS.compress,
      videoCompress: config.videoCompress ?? DEFAULTS.videoCompress,
      autoScan: config.autoScan ?? DEFAULTS.autoScan,
      compressLocal: config.compressLocal ?? DEFAULTS.compressLocal,
      ignore: config.ignore ?? DEFAULTS.ignore,
      sources: config.sources ?? DEFAULTS.sources,
      videoSources: config.videoSources ?? DEFAULTS.videoSources,
    },
    projectRoot: resolvedRoot,
    configPath,
  };
}
