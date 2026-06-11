// Single source of truth for the application secret.
//
// Used both to sign/verify session JWTs and to encrypt AI provider API keys at
// rest, so every module MUST resolve it the same way — previously auth.js
// auto-generated one, ai.js threw if the env var was missing, and the report
// scheduler fell back to the literal string 'fallback-secret', which could
// silently decrypt keys with the wrong key.
//
// Resolution order:
//   1. process.env.JWT_SECRET (production / explicit override)
//   2. a persisted .jwt_secret file in the data directory (survives restarts)
//   3. a freshly generated 64-byte secret, persisted to that file
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function resolveSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  // Persist alongside the database so it survives container/process restarts.
  const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/app/data') ? '/app/data' : path.join(__dirname, '..'));
  const secretPath = path.join(DATA_DIR, '.jwt_secret');

  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing) return existing;
    }
  } catch (e) { /* fall through to generate */ }

  const generated = crypto.randomBytes(64).toString('hex');
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(secretPath, generated, { mode: 0o600 });
    // eslint-disable-next-line no-console
    console.log('🔑 JWT secret generated and persisted to', secretPath);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('⚠️  Could not persist JWT secret to', secretPath, '— sessions and encrypted keys will NOT survive restarts. Set JWT_SECRET for production.');
  }
  return generated;
}

module.exports = resolveSecret();
