'use strict';

const crypto = require('node:crypto');
const { v4: uuidv4 } = require('uuid');
const store = require('./store');

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_STATES = 10000;
const PLATFORMS = Object.freeze({
  instagram: { label: 'Instagram', capabilities: ['profile', 'insights', 'media.read'], requiresAppReview: true },
  youtube: { label: 'YouTube', capabilities: ['profile', 'analytics', 'videos.read'], requiresAppReview: true },
  linkedin: { label: 'LinkedIn', capabilities: ['profile', 'organization.read'], requiresAppReview: true },
});
const OAUTH = Object.freeze({
  instagram: { clientId: 'BOTFORGE_INSTAGRAM_CLIENT_ID', clientSecret: 'BOTFORGE_INSTAGRAM_CLIENT_SECRET', redirectUri: 'BOTFORGE_INSTAGRAM_REDIRECT_URI', scopes: 'BOTFORGE_INSTAGRAM_SCOPES', defaults: ['instagram_business_basic'], authorize: 'https://www.instagram.com/oauth/authorize', token: 'https://api.instagram.com/oauth/access_token' },
  youtube: { clientId: 'BOTFORGE_YOUTUBE_CLIENT_ID', clientSecret: 'BOTFORGE_YOUTUBE_CLIENT_SECRET', redirectUri: 'BOTFORGE_YOUTUBE_REDIRECT_URI', scopes: 'BOTFORGE_YOUTUBE_SCOPES', defaults: ['https://www.googleapis.com/auth/youtube.readonly'], authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' },
  linkedin: { clientId: 'BOTFORGE_LINKEDIN_CLIENT_ID', clientSecret: 'BOTFORGE_LINKEDIN_CLIENT_SECRET', redirectUri: 'BOTFORGE_LINKEDIN_REDIRECT_URI', scopes: 'BOTFORGE_LINKEDIN_SCOPES', defaults: ['openid', 'profile'], authorize: 'https://www.linkedin.com/oauth/v2/authorization', token: 'https://www.linkedin.com/oauth/v2/accessToken' },
});

function getOAuthConfig(platform) {
  const definition = OAUTH[platform];
  if (!definition) throw new TypeError('Unsupported social platform.');
  try { tokenEncryptionKey(); } catch (_) { return null; }\n  const clientId = String(process.env[definition.clientId] || '').trim();
  const clientSecret = String(process.env[definition.clientSecret] || '').trim();
  const redirectUri = String(process.env[definition.redirectUri] || '').trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  let parsed;
  try { parsed = new URL(redirectUri); } catch (_) { return null; }
  if (!['https:', ...(process.env.NODE_ENV === 'production' ? [] : ['http:'])].includes(parsed.protocol) || parsed.username || parsed.password || parsed.hash) return null;
  const rawScopes = String(process.env[definition.scopes] || '').trim();
  const scopes = rawScopes ? rawScopes.split(/[\\s,]+/).filter(Boolean) : definition.defaults;
  if (!scopes.length || scopes.length > 30 || scopes.some(scope => scope.length > 200)) return null;
  return { ...definition, platform, clientId, clientSecret, redirectUri, scopes };
}

function getPlatforms() {
  return Object.entries(PLATFORMS).map(([id, platform]) => {
    const configured = !!getOAuthConfig(id);
    return { id, label: platform.label, configured, capabilities: [...platform.capabilities], publishingAvailable: false, liveOAuthAvailable: configured, requiresAppReview: platform.requiresAppReview };
  });
}

function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function tokenEncryptionKey() {
  const encoded = process.env.BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error('BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) throw new Error('BOTFORGE_SOCIAL_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  return key;
}

function encryptToken(token) {
  if (typeof token !== 'string' || !token || token.length > 16384) throw new TypeError('A non-empty token of at most 16384 characters is required.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return { version: 1, algorithm: 'A256GCM', iv: iv.toString('base64url'), ciphertext: ciphertext.toString('base64url'), tag: cipher.getAuthTag().toString('base64url') };
}

function decryptToken(envelope) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'A256GCM' || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string' || typeof envelope.tag !== 'string') throw new TypeError('Invalid encrypted token envelope.');
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(envelope.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  } catch (_) { throw new Error('Unable to decrypt social token envelope. Check the encryption key and stored data.'); }
}

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  return { verifier, challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), method: 'S256' };
}

async function createOAuthState(userId, platform, now = new Date()) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 128) throw new TypeError('A valid authenticated user ID is required.');
  if (!Object.prototype.hasOwnProperty.call(PLATFORMS, platform)) throw new TypeError('Unsupported social platform.');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('A valid creation time is required.');
  const existing = await store.findManyAsync('socialOAuthStates');
  const expired = existing.filter(row => !row.expiresAt || Date.parse(row.expiresAt) <= now.getTime());
  for (const row of expired) await store.deleteByIdAsync('socialOAuthStates', row.id);
  if (existing.length - expired.length >= MAX_PENDING_STATES) throw new Error('Too many pending social authorization attempts.');
  const state = crypto.randomBytes(32).toString('base64url');
  const pkce = createPkcePair();
  const expiresAt = new Date(now.getTime() + STATE_TTL_MS);
  await store.insertAsync('socialOAuthStates', { id: uuidv4(), stateHash: hash(state), userId, platform, codeVerifierEnvelope: encryptToken(pkce.verifier), createdAt: now.toISOString(), expiresAt: expiresAt.toISOString() });
  return { state, codeChallenge: pkce.challenge, codeChallengeMethod: pkce.method, expiresAt: expiresAt.toISOString() };
}

async function consumeOAuthState(state, userId, platform, now = new Date()) {
  if (typeof state !== 'string' || state.length !== 43 || typeof userId !== 'string' || !(now instanceof Date) || !Number.isFinite(now.getTime())) return null;
  const record = await store.consumeSocialOAuthState(hash(state), userId, platform, now);
  return record ? { userId: record.userId, platform: record.platform, codeVerifier: record.codeVerifierEnvelope ? decryptToken(record.codeVerifierEnvelope) : record.codeVerifier } : null;
}

function publicConnection(row) {
  return { id: row.id, platform: row.platform, platformAccountId: row.platformAccountId, displayName: row.displayName, scopes: [...row.scopes], tokenExpiresAt: row.tokenExpiresAt || null, status: row.status, connectedAt: row.connectedAt, updatedAt: row.updatedAt };
}

async function connectAccount(input) {
  if (!input || typeof input !== 'object' || typeof input.userId !== 'string' || !input.userId.trim() || input.userId.length > 128) throw new TypeError('A valid user ID is required.');
  if (!Object.prototype.hasOwnProperty.call(PLATFORMS, input.platform)) throw new TypeError('Unsupported social platform.');
  for (const [key, max] of [['platformAccountId', 256], ['displayName', 120], ['accessToken', 16384]]) if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > max) throw new TypeError('Invalid social connection ' + key + '.');
  if (input.refreshToken !== undefined && input.refreshToken !== null && (typeof input.refreshToken !== 'string' || input.refreshToken.length > 16384)) throw new TypeError('Invalid social refresh token.');
  if (!Array.isArray(input.scopes) || input.scopes.length > 50 || input.scopes.some(scope => typeof scope !== 'string' || !scope.trim() || scope.length > 200)) throw new TypeError('Invalid granted social scopes.');
  const tokenExpiresAt = input.tokenExpiresAt || null;
  if (tokenExpiresAt !== null && !Number.isFinite(Date.parse(tokenExpiresAt))) throw new TypeError('Invalid token expiry timestamp.');
  const existing = await store.findManyAsync('socialConnections', { userId: input.userId });
  const current = existing.find(row => row.platform === input.platform && row.platformAccountId === input.platformAccountId);
  const now = new Date().toISOString();
  const patch = {
    userId: input.userId, platform: input.platform, platformAccountId: input.platformAccountId,
    displayName: input.displayName.trim(), scopes: [...new Set(input.scopes)],
    accessTokenEnvelope: encryptToken(input.accessToken),
    refreshTokenEnvelope: input.refreshToken === undefined ? (current?.refreshTokenEnvelope || null) : (input.refreshToken ? encryptToken(input.refreshToken) : null),
    tokenExpiresAt, status: 'connected', connectedAt: current?.connectedAt || now, updatedAt: now,
  };
  let saved;
  if (current) saved = await store.updateByIdAsync('socialConnections', current.id, patch);
  else { saved = { id: uuidv4(), ...patch }; await store.insertAsync('socialConnections', saved); }
  return publicConnection(saved);
}

async function listConnections(userId) {
  if (typeof userId !== 'string' || !userId.trim()) throw new TypeError('A valid user ID is required.');
  const rows = await store.findManyAsync('socialConnections', { userId });
  return rows.filter(row => row.status === 'connected').map(publicConnection);
}

async function getConnectionCredentials(userId, connectionId) {
  if (typeof userId !== 'string' || !userId.trim() || typeof connectionId !== 'string') return null;
  const row = await store.findByIdAsync('socialConnections', connectionId);
  if (!row || row.userId !== userId || row.status !== 'connected') return null;
  return { accessToken: decryptToken(row.accessTokenEnvelope), refreshToken: row.refreshTokenEnvelope ? decryptToken(row.refreshTokenEnvelope) : null, platform: row.platform, platformAccountId: row.platformAccountId, scopes: [...row.scopes] };
}

async function disconnectConnection(userId, connectionId) {
  if (typeof userId !== 'string' || !userId.trim() || typeof connectionId !== 'string') return false;
  const row = await store.findByIdAsync('socialConnections', connectionId);
  if (!row || row.userId !== userId) return false;
  await store.deleteByIdAsync('socialConnections', connectionId);
  return true;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12000) });
  let data;
  try { data = await response.json(); } catch (_) { data = null; }
  if (!response.ok || !data || typeof data !== 'object') throw new Error('Social provider authorization failed. Check provider app configuration and granted permissions.');
  return data;
}

function authorizationUrl(platform, state, codeChallenge) {
  const config = getOAuthConfig(platform);
  if (!config) throw new Error('Social provider OAuth credentials or callback URL are not configured.');
  const url = new URL(config.authorize);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', config.scopes.join(platform === 'instagram' ? ',' : ' '));
  if (platform === 'youtube') {
    if (typeof codeChallenge === 'string' && codeChallenge) {
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
    }
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent select_account');
  }
  if (platform === 'instagram') {
    url.searchParams.set('enable_fb_login', '0');
    url.searchParams.set('force_authentication', '1');
  }
  return url.toString();
}

async function exchangeOAuthCodeForUser({ userId, platform, code, codeVerifier }) {
  const config = getOAuthConfig(platform);
  if (!config) throw new Error('Social provider OAuth credentials or callback URL are not configured.');
  if (typeof code !== 'string' || !code.trim() || code.length > 4096) throw new TypeError('Invalid social authorization code.');
  const body = new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code, grant_type: 'authorization_code' });
  if (platform === 'youtube' && typeof codeVerifier === 'string') body.set('code_verifier', codeVerifier);
  const token = await requestJson(config.token, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body });
  if (typeof token.access_token !== 'string' || !token.access_token) throw new Error('Social provider did not return an access token.');
  let accessToken = token.access_token;
  const refreshToken = typeof token.refresh_token === 'string' ? token.refresh_token : undefined;
  let expiresIn = Number(token.expires_in) || 0;
  let profile;
  if (platform === 'youtube') {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'snippet'); url.searchParams.set('mine', 'true');
    const data = await requestJson(url, { headers: { authorization: 'Bearer ' + accessToken } });
    const channel = data.items?.[0];
    if (!channel?.id) throw new Error('The authorized Google account has no accessible YouTube channel.');
    profile = { id: String(channel.id), name: String(channel.snippet?.title || 'YouTube channel') };
  } else if (platform === 'linkedin') {
    const data = await requestJson('https://api.linkedin.com/v2/userinfo', { headers: { authorization: 'Bearer ' + accessToken } });
    if (!data.sub) throw new Error('LinkedIn did not return a member identity.');
    profile = { id: String(data.sub), name: String(data.name || data.given_name || 'LinkedIn member') };
  } else {
    const url = new URL('https://graph.instagram.com/me');
    url.searchParams.set('fields', 'user_id,username');
    const data = await requestJson(url, { headers: { authorization: 'Bearer ' + accessToken } });
    const id = data.user_id || data.id;
    if (!id) throw new Error('Instagram did not return a professional account identity.');
    profile = { id: String(id), name: String(data.username || 'Instagram account') };
    const longLivedUrl = new URL('https://graph.instagram.com/access_token');
    longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
    longLivedUrl.searchParams.set('client_secret', config.clientSecret);
    longLivedUrl.searchParams.set('access_token', accessToken);
    const longLived = await requestJson(longLivedUrl);
    if (typeof longLived.access_token === 'string') accessToken = longLived.access_token;
    expiresIn = Number(longLived.expires_in) || expiresIn;
  }
  const scopes = typeof token.scope === 'string' ? token.scope.split(/[\\s,]+/).filter(Boolean) : config.scopes;
  return connectAccount({
    userId, platform, platformAccountId: profile.id, displayName: profile.name, scopes, accessToken, refreshToken,
    tokenExpiresAt: expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
  });
}

async function completeOAuth({ userId, platform, state, code }) {
  const consumed = await consumeOAuthState(state, userId, platform);
  if (!consumed) throw new Error('Social authorization state is invalid, expired or already used.');
  return exchangeOAuthCodeForUser({ userId, platform, code, codeVerifier: consumed.codeVerifier });
}

async function refreshConnection(userId, connectionId) {
  const row = await store.findByIdAsync('socialConnections', connectionId);
  if (!row || row.userId !== userId || row.status !== 'connected') return null;
  const config = getOAuthConfig(row.platform);
  if (!config) throw new Error('Social provider OAuth credentials are not configured.');
  const credentials = await getConnectionCredentials(userId, connectionId);
  let data;
  if (row.platform === 'instagram') {
    const url = new URL('https://graph.instagram.com/refresh_access_token');
    url.searchParams.set('grant_type', 'ig_refresh_token'); url.searchParams.set('access_token', credentials.accessToken);
    data = await requestJson(url);
  } else {
    if (!credentials.refreshToken) throw new Error('This provider did not issue a refresh token. Reconnect the account to renew access.');
    data = await requestJson(config.token, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }),
    });
  }
  if (typeof data.access_token !== 'string' || !data.access_token) throw new Error('Social provider did not return a refreshed access token.');
  const patch = {
    accessTokenEnvelope: encryptToken(data.access_token),
    tokenExpiresAt: Number(data.expires_in) > 0 ? new Date(Date.now() + Number(data.expires_in) * 1000).toISOString() : row.tokenExpiresAt,
    updatedAt: new Date().toISOString(),
  };
  if (typeof data.refresh_token === 'string' && data.refresh_token) patch.refreshTokenEnvelope = encryptToken(data.refresh_token);
  const saved = await store.updateByIdAsync('socialConnections', connectionId, patch);
  return saved ? publicConnection(saved) : null;
}

module.exports = {
  PLATFORMS, getPlatforms, getOAuthConfig, authorizationUrl, createOAuthState, consumeOAuthState,
  createPkcePair, encryptToken, decryptToken, connectAccount, listConnections,
  getConnectionCredentials, disconnectConnection, completeOAuth, refreshConnection, STATE_TTL_MS,
};
