'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateToolRequest, getToolCatalog } = require('../server/agent-tool-registry');

function policy(toolId, argumentsValue, overrides = {}) {
  return validateToolRequest({ toolId, arguments: argumentsValue }, {
    runStatus: 'approved',
    approvedToolIds: [toolId],
    writePermission: toolId === 'draft.create',
    externalPermission: false,
    ...overrides,
  });
}

test('Agent Lab tool policy rejects unapproved or unapproved-status runs', () => {
  assert.equal(policy('text.analyze', { text: 'hello' }, { runStatus: 'planned' }).valid, false);
  assert.equal(policy('text.analyze', { text: 'hello' }, { approvedToolIds: [] }).valid, false);
});

test('Agent Lab tool policy rejects unknown tool identifiers and malformed requests', () => {
  assert.equal(validateToolRequest(null).valid, false);
  assert.equal(validateToolRequest({ toolId: 'shell.exec', arguments: {} }).valid, false);
  assert.equal(validateToolRequest({ toolId: 'text.analyze', arguments: [] }).valid, false);
});

test('Agent Lab tool policy enforces the bounded argument payload', () => {
  const tooLarge = { text: 'x'.repeat(5000) };
  const result = policy('text.analyze', tooLarge);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.includes('4 KB')));
});

test('write tools require explicit write permission even when individually approved', () => {
  const result = policy('draft.create', { title: 'Draft', content: 'Body' }, { writePermission: false });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('write permission is required'));
});

test('external tools require explicit external permission and remain catalog-disabled', () => {
  const catalog = getToolCatalog();
  const webTool = catalog.find(tool => tool.id === 'web.search');
  assert.equal(webTool.executionAvailable, false);
  const result = validateToolRequest({ toolId: 'web.search', arguments: { query: 'test' } }, {
    runStatus: 'approved',
    approvedToolIds: ['web.search'],
    externalPermission: false,
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('tool execution is not enabled'));
  assert.ok(result.errors.includes('external access permission is required'));
});
