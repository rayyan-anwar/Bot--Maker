'use strict';

const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const fortisni = require('./fortisni-engine');

const MAX_EVENTS_PER_USER = 100;
const EVENT_TYPES = new Set(['plan.queued','plan.started','step.started','step.completed','plan.completed','plan.failed','plan.cancelled']);

async function publish({ userId, planId, taskId = null, type, message, metadata = {} }) {
  if (typeof userId !== 'string' || !userId || !EVENT_TYPES.has(type)) return null;
  const safeMessage = String(message || '').slice(0, 500);
  const reaction = fortisni.getReaction(safeMessage, { source: 'agent-lab', event: type });
  const event = {
    id: uuidv4(), kind: 'fortisni-event', userId,
    planId: typeof planId === 'string' ? planId : null,
    taskId: typeof taskId === 'string' ? taskId : null,
    type, message: safeMessage,
    reaction: {
      emotion: reaction.emotion, state: reaction.state,
      intensity: reaction.intensity, expression: reaction.expression,
      animation: reaction.animation, guidance: reaction.guidance,
    },
    metadata: {
      step: Number.isInteger(metadata.step) ? metadata.step : null,
      totalSteps: Number.isInteger(metadata.totalSteps) ? metadata.totalSteps : null,
    },
    createdAt: new Date().toISOString(),
  };
  await store.insertAsync('aiEngineerRuns', event);
  const rows = await store.findManyAsync('aiEngineerRuns', { userId });
  const stale = rows.filter(row => row.kind === 'fortisni-event')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(MAX_EVENTS_PER_USER);
  for (const row of stale) await store.deleteByIdAsync('aiEngineerRuns', row.id);
  return event;
}

async function listForUser(userId, limit = 30) {
  const safeLimit = Math.max(1, Math.min(100, Number.isInteger(limit) ? limit : 30));
  const rows = await store.findManyAsync('aiEngineerRuns', { userId });
  return rows.filter(row => row.kind === 'fortisni-event')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, safeLimit);
}

module.exports = { publish, listForUser, EVENT_TYPES, MAX_EVENTS_PER_USER };
