import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIgnoreFilter } from '../src/lib/ignore.js';

test('empty ignore list matches nothing', () => {
  const shouldIgnore = buildIgnoreFilter([]);
  assert.equal(shouldIgnore('https://example.com/image.png'), false);
});

test('string pattern matches by substring', () => {
  const shouldIgnore = buildIgnoreFilter(['cdn.ignored.com']);
  assert.equal(shouldIgnore('https://cdn.ignored.com/hero.png'), true);
  assert.equal(shouldIgnore('https://cdn.example.com/hero.png'), false);
});

test('regex pattern matches correctly', () => {
  const shouldIgnore = buildIgnoreFilter(['/avatar-\\d+\\.png/']);
  assert.equal(shouldIgnore('/images/avatar-42.png'), true);
  assert.equal(shouldIgnore('/images/avatar-abc.png'), false);
});

test('multiple patterns - any match returns true', () => {
  const shouldIgnore = buildIgnoreFilter(['skip-me', '/^dynamic/']);
  assert.equal(shouldIgnore('https://example.com/skip-me.jpg'), true);
  assert.equal(shouldIgnore('dynamic-content.png'), true);
  assert.equal(shouldIgnore('https://example.com/keep.png'), false);
});

test('file paths can be ignored', () => {
  const shouldIgnore = buildIgnoreFilter(['src/assets/logo']);
  assert.equal(shouldIgnore('src/assets/logo.png'), true);
  assert.equal(shouldIgnore('src/components/Hero.jsx'), false);
});
