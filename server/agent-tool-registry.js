'use strict';

const MAX_ARGUMENT_BYTES = 4096;
const MAX_TEXT_CHARS = 12000;
const TOOL_CATALOG = Object.freeze([
  Object.freeze({ id: 'knowledge.search', title: 'Search bot knowledge', description: 'Search documents attached to a bot for relevant information.', category: 'knowledge', access: 'read', external: false, enabled: true }),
  Object.freeze({ id: 'web.search', title: 'Search public web', description: 'Retrieve public web information from an approved search provider.', category: 'research', access: 'read', external: true, enabled: false }),
  Object.freeze({ id: 'bot.read', title: 'Read bot configuration', description: 'Read configuration for a bot owned by the current user.', category: 'bot', access: 'read', external: false, enabled: false }),
  Object.freeze({ id: 'text.analyze', title: 'Analyze text', description: 'Analyze supplied text and return basic statistics.', category: 'analysis', access: 'read', external: false, enabled: true }),
  Object.freeze({ id: 'draft.create', title: 'Create a draft', description: 'Create a draft artifact for the user to review.', category: 'writing', access: 'write', external: false, enabled: true })
]);

function isSafeJsonData(value, depth = 0, seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || depth > 20 || seen.has(value)) return false;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  if (Object.getOwnPropertySymbols(value).length) return false;
  seen.add(value);
  let valid = true;
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    if (typeof key !== 'string' || key === '__proto__' || key === 'prototype' || key === 'constructor') { valid = false; break; }
    if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length)) { valid = false; break; }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !Object.prototype.hasOwnProperty.call(descriptor, 'value') || !isSafeJsonData(descriptor.value, depth + 1, seen)) { valid = false; break; }
  }
  if (valid && Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) { valid = false; break; }
  }
  seen.delete(value);
  return valid;
}

function getToolCatalog() {
  return TOOL_CATALOG.map(tool => ({ ...tool, requiresApproval: true, executionAvailable: tool.enabled }));
}

function validateToolRequest(request, context = {}) {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { valid: false, errors: ['request must be an object'], tool: null, executable: false };
  const tool = TOOL_CATALOG.find(item => item.id === request.toolId);
  if (!tool) return { valid: false, errors: ['tool is not in the allowlisted catalog'], tool: null, executable: false };
  if (!tool.enabled) errors.push('tool execution is not enabled');
  if (context.runStatus !== 'approved') errors.push('run must be approved before tool execution');
  if (!Array.isArray(context.approvedToolIds) || !context.approvedToolIds.includes(tool.id)) errors.push('tool must be explicitly approved for this run');
  if (tool.access === 'write' && context.writePermission !== true) errors.push('write permission is required');
  if (tool.external && context.externalPermission !== true) errors.push('external access permission is required');
  const args = request.arguments === undefined ? {} : request.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) errors.push('arguments must be an object');
  else {
    try { if (Buffer.byteLength(JSON.stringify(args), 'utf8') > MAX_ARGUMENT_BYTES) errors.push('arguments exceed the 4 KB limit'); }
    catch (_) { errors.push('arguments must be valid JSON data'); }
  }
  return { valid: errors.length === 0, errors, tool: { id: tool.id, access: tool.access, external: tool.external }, executable: errors.length === 0 && tool.enabled };
}

function executeSafeTool(toolId, args = {}) {
  if (toolId === 'text.analyze') {
    const text = args.text;
    if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT_CHARS) throw new Error('Text must contain 1 to 12,000 characters.');
    const words = text.trim().split(/\s+/).filter(Boolean);
    return { type: 'text-analysis', characters: text.length, words: words.length, lines: text.split(/\r?\n/).length, sentences: (text.match(/[.!?]+(?=\s|$)/g) || []).length, preview: text.slice(0, 240) };
  }
  if (toolId === 'draft.create') {
    if (typeof args.title !== 'string' || !args.title.trim() || args.title.length > 160) throw new Error('Draft title must contain 1 to 160 characters.');
    if (typeof args.content !== 'string' || !args.content.trim() || args.content.length > MAX_TEXT_CHARS) throw new Error('Draft content must contain 1 to 12,000 characters.');
    return { type: 'draft', title: args.title.trim(), content: args.content.trim(), status: 'preview-only', createdAt: new Date().toISOString() };
  }
  throw new Error('This tool does not have an execution implementation.');
}

module.exports = { TOOL_CATALOG, MAX_ARGUMENT_BYTES, MAX_TEXT_CHARS, getToolCatalog, validateToolRequest, executeSafeTool };
