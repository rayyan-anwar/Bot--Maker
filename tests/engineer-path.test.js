const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedEngineerPath } = require('../server/engineer-path');

test('AI Engineer path validator accepts normalized JS and JSON files in allowed roots', () => {
  for (const value of [
    'server/admin.js',
    'server/routes/auth.js',
    'server/config/runtime.json',
    'tests/admin-auth.test.js',
    'tests/fixtures/provider-response.json'
  ]) assert.equal(isAllowedEngineerPath(value), true, value);
});

test('AI Engineer path validator rejects traversal, absolute, encoded and Windows paths', () => {
  for (const value of [
    '../server/admin.js',
    'server/../private/secrets.js',
    'server/../../etc/passwd.js',
    '/server/admin.js',
    'C:\\server\\admin.js',
    'server\\admin.js',
    'server/%2e%2e/secrets.js',
    'server//admin.js',
    'server/./admin.js',
    'server/',
    'server/admin.ts',
    'public/js/fortisni.js',
    'docs/notes.json',
    '',
    null,
    42
  ]) assert.equal(isAllowedEngineerPath(value), false, String(value));
});


test('AI Engineer path validator rejects Unicode lookalikes and control-character bypass attempts', () => {
  for (const value of [
    'server／admin.js', // Fullwidth solidus
    'server∕admin.js', // Division slash
    'server/admіn.js', // Cyrillic i
    'server/admin.js\\n',
    'server/admin.js\\r',
    'server/\\u0000admin.js',
    'server/..\\u002fprivate.json',
    'server/%252e%252e%252fsecrets.js',
    'server\\u2215admin.js',
    'server/admin.js/',
    'server/' + 'a'.repeat(241) + '.js'
  ]) assert.equal(isAllowedEngineerPath(value), false, JSON.stringify(value));
});
