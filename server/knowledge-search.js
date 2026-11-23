'use strict';

const store = require('./store');
const { topChunksHybrid } = require('./retrieval');

const MAX_QUERY_CHARS = 500;
const MAX_RESULTS = 8;
const MAX_RESULT_CHARS = 1200;

async function searchBotKnowledge({ userId, botId, query, limit = 4 } = {}) {
  if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('A valid user context is required.');
  if (typeof botId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(botId)) throw new TypeError('A valid botId is required.');
  if (typeof query !== 'string' || !query.trim() || query.length > MAX_QUERY_CHARS) throw new TypeError('Query must contain 1 to 500 characters.');
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS) throw new RangeError('Limit must be an integer between 1 and 8.');
  const bot = await store.findByIdAsync('bots', botId);
  if (!bot || bot.ownerId !== userId) throw new Error('Bot not found or access denied.');
  const docs = await store.findManyAsync('documents', { botId: bot.id });
  if (!docs.length) return { type: 'knowledge-search', botId: bot.id, query: query.trim(), results: [] };
  const matches = await topChunksHybrid(docs, query.trim(), limit);
  return {
    type: 'knowledge-search',
    botId: bot.id,
    query: query.trim(),
    results: matches.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      chunkId: String(item.chunkId || '').slice(0, 120),
      documentId: String(item.documentId || item.id || '').slice(0, 120),
      filename: String(item.filename || 'document').slice(0, 160),
      text: String(item.text || '').slice(0, MAX_RESULT_CHARS),
      score: Number.isFinite(item.score) ? item.score : undefined
    }))
  };
}

module.exports = { searchBotKnowledge, MAX_QUERY_CHARS, MAX_RESULTS, MAX_RESULT_CHARS };
