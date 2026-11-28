'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { requireAuth } = require('./auth');
const social = require('./social-intelligence');
const router = express.Router();

const stateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => req.user.id,
  message: { error: 'Too many social authorization attempts. Try again later.' },
});

router.get('/platforms', requireAuth, (req, res) => res.json({ platforms: social.getPlatforms() }));

router.get('/connections', requireAuth, async (req, res, next) => {
  try { res.json({ connections: await social.listConnections(req.user.id) }); }
  catch (error) { next(error); }
});

router.delete('/connections/:id', requireAuth, async (req, res, next) => {
  try {
    const removed = await social.disconnectConnection(req.user.id, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Social connection not found.' });
    res.json({ ok: true });
  } catch (error) { next(error); }
});

router.post('/connections/:id/refresh', requireAuth, async (req, res, next) => {
  try {
    const connection = await social.refreshConnection(req.user.id, req.params.id);
    if (!connection) return res.status(404).json({ error: 'Social connection not found.' });
    res.json({ connection });
  } catch (error) { next(error); }
});

router.post('/:platform/oauth/state', requireAuth, stateLimiter, async (req, res, next) => {
  try {
    if (!Object.prototype.hasOwnProperty.call(social.PLATFORMS, req.params.platform)) return res.status(404).json({ error: 'Unsupported social platform.' });
    if (!social.getOAuthConfig(req.params.platform)) return res.status(503).json({ error: 'This social provider is not fully configured.' });
    const authorization = await social.createOAuthState(req.user.id, req.params.platform);
    const url = social.authorizationUrl(req.params.platform, authorization.state, authorization.codeChallenge);
    res.status(201).json({ platform: req.params.platform, ...authorization, authorizationUrl: url, authorizationUrlAvailable: true });
  } catch (error) { next(error); }
});

router.get('/:platform/oauth/callback', requireAuth, async (req, res) => {
  const platform = req.params.platform;
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  try {
    if (!Object.prototype.hasOwnProperty.call(social.PLATFORMS, platform)) return res.status(404).send('Unsupported social platform.');
    if (req.query.error) {
      await social.consumeOAuthState(state, req.user.id, platform);
      return res.redirect('/dashboard.html?social_error=authorization_denied');
    }
    const connection = await social.completeOAuth({ userId: req.user.id, platform, state, code: req.query.code });
    return res.redirect('/dashboard.html?social_connected=' + encodeURIComponent(connection.platform));
  } catch (_) {
    return res.redirect('/dashboard.html?social_error=connection_failed');
  }
});

module.exports = { router };
