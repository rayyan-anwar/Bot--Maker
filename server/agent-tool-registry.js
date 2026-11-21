'use strict';

/**
 * Agent Lab tool catalog and execution gate.
 * Catalog entries are descriptive only until a tool implementation is registered.
 * This module deliberately does not execute tools.
 */
const MAX_ARGUMENT_BYTES = 4096;
const TOOL_CATALOG = Object.freeze([
  Object.freeze({ id: 'knowledge.search', title: 'Search bot knowledge', description: 'Search documents attached to a bot for relevant information.', category: 'knowledge', access: 'read', external: false, enabled: false }),
  Object.freeze({ id: 'web.search', title: 'Search public web', description: 'Retrieve public web information from an approved search provider.', category: 'research', access: 'read', external: true, enabled: false }),
  Object.freeze({ id: 'bot.read', title: 'Read bot configuration', description: 'Read configuration for a bot owned by the current user.', category: 'bot', access: 'read', external: false, enabled: false }),
  Object.freeze({ id: 'text.analyze', title: 'Analyze text', description: 'Analyze text supplied within the task context.', category: 'analysis', access: 'read', external: false, enabled: false }),
  Object.freeze({ id: 'draft.create', title: 'Create a draft', description: 'Create a draft artifact for the user to review.', category: 'writing', access: 'write', external: false, enabled: false })
]);

function getToolCatalog() {
  return TOOL_CATALOG.map(tool => ({ ...tool, requiresApproval: true, executionAvailable: false }));
}

function validateToolRequest(request, context = {}) {
  const errors = [];
  if (!request || typeof request !== 'object' || Array.isArray(request)) return { valid: false, errors: ['request must be an object'], tool: null };
  const tool = TOOL_CATALOG.find(item => item.id === request.toolId);
  if (!tool) errors.push('tool is not in the allowlisted catalog');
  if (!tool) return { valid: false, errors, tool: null };
  if (tool.enabled !== true) errors.push('tool execution is not enabled');
  if (context.runStatus !== 'approved') errors.push('run must be approved before tool execution');
  if (!Array.isArray(context.approvedToolIds) || !context.approvedToolIds.includes(tool.id)) errors.push('tool must be explicitly approved for this run');
  if (tool.access === 'write' && context.writePermission !== true) errors.push('write permission is required');
  if (tool.external && context.externalPermission !== true) errors.push('external access permission is required');
  const args = request.arguments === undefined ? {} : request.arguments;
  if (!args || typeof args !== 'object' || Array.isArray(args)) errors.push('arguments must be an object');
  else if (Buffer.byteLength(JSON.stringify(args), 'utf8') > MAX_ARGUMENT_BYTES) errors.push('arguments exceed the 4 KB limit');
  return { valid: errors.length === 0, errors, tool: { id: tool.id, access: tool.access, external: tool.external }, executable: false };
}

module.exports = { TOOL_CATALOG, MAX_ARGUMENT_BYTES, getToolCatalog, validateToolRequest };
