const express = require('express');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');
const { requireAuth } = require('./auth');

const router = express.Router();

function publicBot(bot) {
  return {
    id: bot.id,
    ownerId: bot.ownerId,
    name: bot.name,
    description: bot.description || '',
    instructions: bot.instructions,
    isPublic: !!bot.isPublic,
    createdAt: bot.createdAt
  };
}

// List the current user's own bots.
router.get('/mine', requireAuth, (req, res) => {
  const bots = store.all('bots').filter((b) => b.ownerId === req.user.id);
  res.json({ bots: bots.map(publicBot) });
});

// Browse bots other people have made public.
router.get('/public', requireAuth, (req, res) => {
  const bots = store.all('bots').filter((b) => b.isPublic);
  res.json({ bots: bots.map(publicBot) });
});

router.post('/', requireAuth, (req, res) => {
  const { name, instructions, description, isPublic } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Give your bot a name.' });
  }
  if (!instructions || !instructions.trim()) {
    return res.status(400).json({ error: "Tell your bot how it should behave — that's its instructions." });
  }

  const bot = {
    id: uuidv4(),
    ownerId: req.user.id,
    name: name.trim().slice(0, 80),
    description: (description || '').trim().slice(0, 200),
    instructions: instructions.trim().slice(0, 6000),
    isPublic: !!isPublic,
    createdAt: new Date().toISOString()
  };
  store.insert('bots', bot);
  res.status(201).json({ bot: publicBot(bot) });
});

router.get('/:id', requireAuth, (req, res) => {
  const bot = store.findById('bots', req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.ownerId !== req.user.id && !bot.isPublic) {
    return res.status(403).json({ error: "You don't have access to this bot." });
  }
  res.json({ bot: publicBot(bot), isOwner: bot.ownerId === req.user.id });
});

router.put('/:id', requireAuth, (req, res) => {
  const bot = store.findById('bots', req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can edit this bot.' });

  const { name, instructions, description, isPublic } = req.body || {};
  const patch = {};
  if (name !== undefined) patch.name = name.trim().slice(0, 80);
  if (description !== undefined) patch.description = description.trim().slice(0, 200);
  if (instructions !== undefined) patch.instructions = instructions.trim().slice(0, 6000);
  if (isPublic !== undefined) patch.isPublic = !!isPublic;

  const updated = store.updateById('bots', bot.id, patch);
  res.json({ bot: publicBot(updated) });
});

router.delete('/:id', requireAuth, (req, res) => {
  const bot = store.findById('bots', req.params.id);
  if (!bot) return res.status(404).json({ error: 'Bot not found.' });
  if (bot.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can delete this bot.' });

  store.deleteById('bots', bot.id);
  // Clean up this bot's documents and messages too.
  const db = store.load();
  db.documents = db.documents.filter((d) => d.botId !== bot.id);
  db.messages = db.messages.filter((m) => m.botId !== bot.id);
  store.persist();

  res.json({ ok: true });
});

module.exports = { router, publicBot };
