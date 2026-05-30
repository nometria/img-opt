#!/usr/bin/env node
/**
 * img-opt CLI - download, compress, and rewrite image + video assets.
 *
 * Usage:
 *   npx img-opt               # full pipeline (scan → download → compress → replace)
 *   npx img-opt scan           # discover external URLs in codebase (dry-run)
 *   npx img-opt download       # download images + videos
 *   npx img-opt compress       # compress images to WebP (Sharp)
 *   npx img-opt video          # compress videos to WebM (ffmpeg)
 *   npx img-opt replace        # rewrite URLs in source files
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SCRIPTS = {
  download: path.join(__dirname, 'download.js'),
  compress: path.join(__dirname, 'compress.js'),
  replace:  path.join(__dirname, 'replace.js'),
  scan:     path.join(__dirname, 'scan.js'),
  video:    path.join(__dirname, 'video-compress.js'),
  all:      path.join(__dirname, 'run-all.js'),
};

// Flags that should be forwarded to sub-scripts
const FORWARD_FLAGS = ['--dry-run'];

function run(scriptPath, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...extraArgs], { stdio: 'inherit', cwd: process.cwd() });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Exit ${code}`))));
  });
}

const args = process.argv.slice(2);
const cmd = args.find((a) => !a.startsWith('-')) || 'all';
const flags = args.filter((a) => FORWARD_FLAGS.includes(a));

if (cmd === '--help' || cmd === '-h' || args.includes('--help') || args.includes('-h')) {
  console.log([
    'img-opt - download, compress, and rewrite image + video assets',
    '',
    'Usage:',
    '  npx img-opt                # full pipeline (download → compress → replace)',
    '  npx img-opt scan           # discover external image/video URLs (dry-run)',
    '  npx img-opt download       # fetch external images + videos',
    '  npx img-opt compress       # convert PNG/JPG → WebP via Sharp',
    '  npx img-opt video          # convert MP4/MOV → WebM via ffmpeg',
    '  npx img-opt replace        # rewrite external URLs in source files',
    '',
    'Flags:',
    '  --dry-run                  # show what would be replaced without modifying files',
    '',
    'Auto-scan: when no sources are configured, img-opt scans your codebase',
    'for external image and video URLs automatically. No config file needed.',
    '',
    'Config (optional): image-assets.config.js in project root',
    '  cp node_modules/@nometria-ai/img-opt/image-assets.config.example.js image-assets.config.js',
  ].join('\n'));
  process.exit(0);
}

const script = SCRIPTS[cmd];

if (!script) {
  console.error(`Unknown command: ${cmd}. Use: all | scan | download | compress | video | replace`);
  process.exit(1);
}

run(script, flags).catch((e) => { console.error(e.message); process.exit(1); });
