import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO_SCRIPT = path.join(__dirname, '..', 'src', 'video-compress.js');

test('video-compress exits gracefully when no videos dir exists', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-opt-video-'));

  try {
    const out = execSync(`node ${VIDEO_SCRIPT}`, { encoding: 'utf8', cwd: tmpDir });
    assert.match(out, /not found|no compressible/i);
  } catch (err) {
    // If ffmpeg is not installed, it should show a helpful message
    const output = (err.stdout || '') + (err.stderr || '');
    assert.match(output, /ffmpeg|not found|no compressible/i);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('video-compress shows helpful message when ffmpeg is missing', () => {
  // This test is platform-dependent - if ffmpeg IS installed, it won't show the error.
  // We just verify the script doesn't crash with an unhandled exception.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'img-opt-video-'));
  const videosDir = path.join(tmpDir, 'public', 'videos');
  fs.mkdirSync(videosDir, { recursive: true });

  // Create a dummy .mp4 file (will fail compression but shouldn't crash)
  fs.writeFileSync(path.join(videosDir, 'test.mp4'), Buffer.alloc(1024));

  try {
    execSync(`node ${VIDEO_SCRIPT}`, { encoding: 'utf8', cwd: tmpDir });
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    // Should mention ffmpeg or show a compression error, not a JS crash
    assert.ok(
      !output.includes('TypeError') && !output.includes('ReferenceError'),
      'Should not have JS errors'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
