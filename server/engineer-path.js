'use strict';

const ALLOWED_ROOTS = new Set(['server', 'tests']);
const ALLOWED_EXTENSIONS = new Set(['.js', '.json']);

/**
 * Accept only normalized repository-relative JS/JSON paths beneath server/ or tests/.
 * Reject traversal, absolute paths, Windows separators, empty segments and encoded input.
 */
function isAllowedEngineerPath(value) {
  if (typeof value !== 'string' || value.length < 7 || value.length > 240) return false;
  if (value.includes('\\') || value.includes('\0') || value.includes('%')) return false;
  if (value.startsWith('/') || value.endsWith('/') || value.includes('//')) return false;

  const segments = value.split('/');
  if (segments.length < 2 || !ALLOWED_ROOTS.has(segments[0])) return false;
  if (segments.some(segment => !segment || segment === '.' || segment === '..')) return false;
  if (segments.some(segment => !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(segment))) return false;

  const filename = segments[segments.length - 1];
  const extension = filename.slice(filename.lastIndexOf('.'));
  return ALLOWED_EXTENSIONS.has(extension);
}

module.exports = { isAllowedEngineerPath };
