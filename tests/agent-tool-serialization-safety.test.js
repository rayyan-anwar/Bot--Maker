'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateToolRequest, executeSafeTool, MAX_ARGUMENT_BYTES, MAX_TEXT_CHARS } = require('../server/agent-tool-registry');

const context = { runStatus: 'approved', approvedToolIds: ['text.analyze'] };

test('tool policy safely rejects cyclic argument objects', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  const result = validateToolRequest({ toolId: 'text.analyze', arguments: cyclic }, context);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('arguments must be valid JSON data'));
});

test('tool policy safely rejects BigInt argument serialization', () => {
  const result = validateToolRequest({ toolId: 'text.analyze', arguments: { count: 1n } }, context);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('arguments must be valid JSON data'));
});

test('argument limit measures serialized UTF-8 bytes rather than character count', () => {
  const multibyte = '€'.repeat(1400);
  assert.ok(Buffer.byteLength(JSON.stringify({ text: multibyte }), 'utf8') > MAX_ARGUMENT_BYTES);
  const result = validateToolRequest({ toolId: 'text.analyze', arguments: { text: multibyte } }, context);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('4 KB')));
});

test('safe tool executor rejects unknown tools and missing text', () => {
  assert.throws(() => executeSafeTool('shell.exec', {}), /does not have an execution implementation/);
  assert.throws(() => executeSafeTool('text.analyze', {}), /Text must contain/);
  assert.throws(() => executeSafeTool('text.analyze', { text: '   ' }), /Text must contain/);
});

test('draft preview enforces content bounds and does not execute side effects', () => {
  const content = 'x'.repeat(MAX_TEXT_CHARS + 1);
  assert.throws(() => executeSafeTool('draft.create', { title: 'Test', content }), /12,000/);
  const valid = executeSafeTool('draft.create', { title: 'Reviewable', content: 'Content' });
  assert.equal(valid.status, 'preview-only');
  assert.equal(valid.content, 'Content');
  assert.ok(valid.createdAt);
});
