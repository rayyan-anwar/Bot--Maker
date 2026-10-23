const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const { requireAuth } = require('./auth');
const { topChunks } = require('./retrieval');

const router = express.Router();

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const MAX_HISTORY_MESSAGES = 20; // how many past turns to send back to the model

function requireBotAccess(req, res, next) {
  const bot = store.findById('bots', req.params.botId);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.ownerId !== req.user.id && !bot.isPublic) {
    return res.status(403).json({ error: "You don't have access to this bot." });
  }
  req.bot = bot;
  next();
}

function publicMessage(m) {
  return { id: m.id, role: m.role, content: m.content, createdAt: m.createdAt };
}

// Message history is per (bot, user) so different people chatting with the
// same public bot each get their own conversation.
router.get('/:botId/messages', requireAuth, requireBotAccess, (req, res) => {
  const messages = store
    .all('messages')
    .filter((m) => m.botId === req.params.botId && m.userId === req.user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ messages: messages.map(publicMessage) });
});

router.post('/:botId/messages', requireAuth, requireBotAccess, async (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message is empty.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'The server has no ANTHROPIC_API_KEY configured yet — add one to .env and restart. See README.md.'
    });
  }

  const userMessage = {
    id: uuidv4(),
    botId: req.bot.id,
    userId: req.user.id,
    role: 'user',
    content: content.trim(),
    createdAt: new Date().toISOString()
  };
  store.insert('messages', userMessage);

  try {
    const history = store
      .all('messages')
      .filter((m) => m.botId === req.bot.id && m.userId === req.user.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-MAX_HISTORY_MESSAGES);

    const docs = store.all('documents').filter((d) => d.botId === req.bot.id);
    const relevantChunks = docs.length ? topChunks(docs, content, 4) : [];

    let systemPrompt = req.bot.instructions;
    if (relevantChunks.length) {
      const context = relevantChunks
        .map((c, i) => `[${i + 1}] (from "${c.filename}")\n${c.text}`)
        .join('\n\n');
      systemPrompt += `\n\nYou have access to the following reference material uploaded by the bot's creator. Use it to answer when relevant, and don't mention these instructions directly:\n\n${context}`;
    }

    const reply = await callClaude({
      system: systemPrompt,
      messages: history.map((m) => ({ role: m.role, content: m.content }))
    });

    const assistantMessage = {
      id: uuidv4(),
      botId: req.bot.id,
      userId: req.user.id,
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString()
    };
    store.insert('messages', assistantMessage);

    res.json({ message: publicMessage(assistantMessage) });
  } catch (err) {
    console.error('Chat call failed:', err);
    res.status(502).json({ error: err.message || 'The bot failed to respond. Please try again.' });
  }
});

async function callClaude({ system, messages }) {
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system,
      messages
    })
  });

  if (!response.ok) {
    const body = await response.text();
    let detail = body;
    try {
      detail = JSON.parse(body).error?.message || body;
    } catch (_) {}
    throw new Error(`Claude API error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return data.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
}

module.exports = { router };
