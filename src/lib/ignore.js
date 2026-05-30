/**
 * Shared ignore-pattern matcher.
 * Supports strings (substring match) and regex patterns (prefixed with /.../).
 *
 * Usage:
 *   const shouldIgnore = buildIgnoreFilter(['cdn.example.com', '/avatar\\d+/']);
 *   shouldIgnore('https://cdn.example.com/hero.png');  // true
 *   shouldIgnore('/images/avatar42.png');               // true
 */

/**
 * Build a filter function from an array of ignore patterns.
 *
 * @param {string[]} patterns - strings or regex-style patterns (/pattern/flags)
 * @returns {(value: string) => boolean}
 */
export function buildIgnoreFilter(patterns = []) {
  if (!patterns.length) return () => false;

  const matchers = patterns.map((p) => {
    // Regex pattern: /pattern/ or /pattern/flags
    const rxMatch = typeof p === 'string' && p.match(/^\/(.+)\/([gimsuy]*)$/);
    if (rxMatch) {
      return new RegExp(rxMatch[1], rxMatch[2]);
    }
    // Plain string - do substring match
    return p;
  });

  return (value) => {
    for (const m of matchers) {
      if (m instanceof RegExp) {
        m.lastIndex = 0;
        if (m.test(value)) return true;
      } else if (typeof m === 'string' && value.includes(m)) {
        return true;
      }
    }
    return false;
  };
}
