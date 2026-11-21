'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const store = require('../server/store');
const events = require('../server/fortisni-events');

test('Fortisni event service stores bounded owner-scoped reactions', async () => {
  const originalInsert = store.insertAsync;
  const originalFind = store.findManyAsync;
  const originalDelete = store.deleteByIdAsync;
  const rows = [];
  store.insertAsync = async (_collection, row) => { rows.push(row); return row; };
  store.findManyAsync = async (_collection, query) => rows.filter(row => row.userId === query.userId);
  store.deleteByIdAsync = async (_collection, id) => { const index = rows.findIndex(row => row.id === id); if (index >= 0) rows.splice(index, 1); };
  try {
    const event = await events.publish({ userId: 'owner-1', planId: 'plan-1', type: 'step.completed', message: 'Great work, step completed!', metadata: { step: 1, totalSteps: 2 } });
    assert.equal(event.kind, 'fortisni-event');
    assert.equal(event.userId, 'owner-1');
    assert.equal(event.reaction.emotion, 'joy');
    assert.equal(event.metadata.step, 1);
    assert.equal((await events.listForUser('owner-1')).length, 1);
    assert.equal((await events.listForUser('other-user')).length, 0);
    assert.equal(await events.publish({ userId: 'owner-1', type: 'unknown.event', message: 'ignore' }), null);
  } finally {
    store.insertAsync = originalInsert;
    store.findManyAsync = originalFind;
    store.deleteByIdAsync = originalDelete;
  }
});
