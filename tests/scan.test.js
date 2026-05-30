import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(__dirname, '..', 'src', 'scan.js');

function mkTmp() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'img-opt-scan-'));
  fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
  // Config files use ESM (export default) so the temp project needs "type": "module"
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
  return tmp;
}

test('scan CLI runs without crashing (no config, defaults used)', () => {
  const tmpDir = mkTmp();
  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /scan/i);
  } catch (err) {
    assert.ok(!err.stderr?.includes('TypeError'));
    assert.ok(!err.stderr?.includes('ReferenceError'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan detects image URLs in HTML src attributes', () => {
  const tmpDir = mkTmp();
  fs.writeFileSync(path.join(tmpDir, 'src', 'page.html'), `
    <img src="https://cdn.example.com/hero.png" alt="Hero" />
    <img src="https://images.unsplash.com/photo-123.jpg" />
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /hero\.png/);
    assert.match(out, /photo-123\.jpg/);
    assert.match(out, /2 image/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan detects video URLs', () => {
  const tmpDir = mkTmp();
  fs.writeFileSync(path.join(tmpDir, 'src', 'video.jsx'), `
    export default function Hero() {
      return <video src="https://cdn.example.com/demo.mp4" />;
    }
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /demo\.mp4/);
    assert.match(out, /1 video/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan detects CSS url() patterns', () => {
  const tmpDir = mkTmp();
  fs.writeFileSync(path.join(tmpDir, 'src', 'styles.css'), `
    .hero { background-image: url("https://cdn.example.com/bg-pattern.png"); }
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /bg-pattern\.png/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan detects markdown image syntax', () => {
  const tmpDir = mkTmp();
  fs.writeFileSync(path.join(tmpDir, 'src', 'readme.md'), `
    ![Screenshot](https://cdn.example.com/screenshot.png)
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /screenshot\.png/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan deduplicates same URL found in multiple files', () => {
  const tmpDir = mkTmp();
  const url = 'https://cdn.example.com/logo.png';
  fs.writeFileSync(path.join(tmpDir, 'src', 'header.jsx'), `<img src="${url}" />`);
  fs.writeFileSync(path.join(tmpDir, 'src', 'footer.jsx'), `<img src="${url}" />`);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /1 image/);
    assert.match(out, /header\.jsx/);
    assert.match(out, /footer\.jsx/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan detects URLs without file extensions in image contexts', () => {
  const tmpDir = mkTmp();
  fs.writeFileSync(path.join(tmpDir, 'src', 'hero.jsx'), `
    <div style={{backgroundImage: \`url('https://images.unsplash.com/photo-123456?w=1920&q=80')\`}} />
    <img src="https://cdn.example.com/api/resize/photo-789" />
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /photo-123456/);
    assert.match(out, /photo-789/);
    assert.match(out, /2 image/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scan respects ignore patterns - skips matching URLs', () => {
  const tmpDir = mkTmp();
  // Create config with ignore
  fs.writeFileSync(path.join(tmpDir, 'image-assets.config.js'), `
    export default {
      ignore: ['cdn.ignored.com', '/dynamic-\\\\d+/'],
      replaceInDirs: ['src'],
    };
  `);
  fs.writeFileSync(path.join(tmpDir, 'src', 'app.jsx'), `
    <img src="https://cdn.ignored.com/skip-this.png" />
    <img src="https://cdn.example.com/keep-this.png" />
    <img src="https://other.com/dynamic-42.jpg" />
  `);

  try {
    const out = execSync(`node ${CLI}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /keep-this\.png/);
    assert.ok(!out.includes('skip-this'));
    // dynamic-42 should be ignored by /dynamic-\d+/ regex
    assert.ok(!out.includes('dynamic-42'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
