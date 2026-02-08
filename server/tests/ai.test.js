/**
 * AI Intelligence Layer Tests
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set test environment — must match api.test.js DATA_DIR since modules are cached
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATA_DIR = '/tmp/portfolio-tracker-test';

// Clean up test database before tests
beforeAll(() => {
  if (!fs.existsSync(process.env.DATA_DIR)) {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
  }
});

let app;
let authToken;

beforeAll(async () => {
  const serverModule = require('../index.js');
  app = serverModule.app;
  await serverModule.initDatabase();

  // Register & login
  await request(app)
    .post('/api/auth/register')
    .send({ username: 'aitest', email: 'aitest@test.com', password: 'TestPass123!' });

  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ login: 'aitest', password: 'TestPass123!' });

  authToken = loginRes.body.token;
}, 15000);

// ─── Encryption ────────────────────────────────────────────────────

describe('Encryption helpers', () => {
  const { encryptKey, decryptKey } = require('../utils/ai-providers');

  test('encrypt/decrypt roundtrip', () => {
    const secret = 'test-secret-key';
    const original = 'sk-abc123xyz';
    const encrypted = encryptKey(original, secret);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':'); // iv:ciphertext format
    const decrypted = decryptKey(encrypted, secret);
    expect(decrypted).toBe(original);
  });

  test('decrypt with wrong secret fails', () => {
    const encrypted = encryptKey('my-key', 'secret-1');
    expect(() => decryptKey(encrypted, 'wrong-secret')).toThrow();
  });
});

// ─── AI routes require auth ────────────────────────────────────────

describe('AI routes require authentication', () => {
  test('GET /api/ai/providers requires auth', async () => {
    const res = await request(app).get('/api/ai/providers');
    expect(res.status).toBe(401);
  });

  test('POST /api/ai/chat requires auth', async () => {
    const res = await request(app).post('/api/ai/chat').send({ message: 'hi' });
    expect(res.status).toBe(401);
  });

  test('GET /api/ai/conversations requires auth', async () => {
    const res = await request(app).get('/api/ai/conversations');
    expect(res.status).toBe(401);
  });
});

// ─── Provider listing ──────────────────────────────────────────────

describe('Provider listing', () => {
  test('GET /api/ai/providers returns all providers', async () => {
    const res = await request(app)
      .get('/api/ai/providers')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(6);

    const openai = res.body.find(p => p.id === 'openai');
    expect(openai).toBeDefined();
    expect(openai.name).toBe('OpenAI');
    expect(openai.configured).toBe(false);
    expect(openai.requiresKey).toBe(true);
    expect(openai.models.length).toBeGreaterThan(0);

    const ollama = res.body.find(p => p.id === 'ollama');
    expect(ollama).toBeDefined();
    expect(ollama.requiresKey).toBe(false);
  });
});

// ─── API Key CRUD ──────────────────────────────────────────────────

describe('API Key CRUD', () => {
  test('PUT /api/ai/providers/openai/key saves key', async () => {
    const res = await request(app)
      .put('/api/ai/providers/openai/key')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ apiKey: 'sk-test-key-12345', model: 'gpt-4o' });

    expect(res.status).toBe(200);
    expect(res.body.message).toContain('OpenAI');
  });

  test('Provider shows as configured after saving key', async () => {
    const res = await request(app)
      .get('/api/ai/providers')
      .set('Authorization', `Bearer ${authToken}`);

    const openai = res.body.find(p => p.id === 'openai');
    expect(openai.configured).toBe(true);
    expect(openai.modelPreference).toBe('gpt-4o');
  });

  test('PUT /api/ai/providers/invalid/key rejects unknown provider', async () => {
    const res = await request(app)
      .put('/api/ai/providers/invalid/key')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ apiKey: 'test' });

    expect(res.status).toBe(400);
  });

  test('PUT /api/ai/providers/openai/key without key rejects', async () => {
    const res = await request(app)
      .put('/api/ai/providers/openai/key')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('DELETE /api/ai/providers/openai/key removes key', async () => {
    const res = await request(app)
      .delete('/api/ai/providers/openai/key')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
  });

  test('DELETE /api/ai/providers/openai/key returns 404 when no key', async () => {
    const res = await request(app)
      .delete('/api/ai/providers/openai/key')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Chat validation ───────────────────────────────────────────────

describe('Chat endpoint validation', () => {
  test('POST /api/ai/chat with empty message returns 400', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: '' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Message is required');
  });

  test('POST /api/ai/chat with missing message returns 400', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  test('POST /api/ai/chat with unknown provider returns 400', async () => {
    const res = await request(app)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ message: 'hello', provider: 'nonexistent' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Unknown provider');
  });
});

// ─── Conversation CRUD ─────────────────────────────────────────────

describe('Conversation CRUD', () => {
  let conversationId;

  // Create a conversation by inserting directly (since chat requires a real provider)
  beforeAll(() => {
    const { dbRun } = require('../db');

    // Get user id
    const { dbGet } = require('../db');
    const user = dbGet("SELECT id FROM users WHERE username = 'aitest'");

    const result = dbRun(
      'INSERT INTO ai_conversations (user_id, title, context, provider, model) VALUES (?, ?, ?, ?, ?)',
      [user.id, 'Test conversation', 'general', 'openai', 'gpt-4o']
    );
    conversationId = result.lastInsertRowid;

    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, 'user', 'Hello AI']
    );
    dbRun(
      'INSERT INTO ai_messages (conversation_id, role, content) VALUES (?, ?, ?)',
      [conversationId, 'assistant', 'Hello! How can I help you?']
    );
  });

  test('GET /api/ai/conversations lists conversations', async () => {
    const res = await request(app)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('title');
    expect(res.body[0]).toHaveProperty('context');
  });

  test('GET /api/ai/conversations/:id returns conversation with messages', async () => {
    const res = await request(app)
      .get(`/api/ai/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Test conversation');
    expect(res.body.messages).toBeDefined();
    expect(res.body.messages.length).toBe(2);
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('assistant');
  });

  test('GET /api/ai/conversations/99999 returns 404', async () => {
    const res = await request(app)
      .get('/api/ai/conversations/99999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });

  test('DELETE /api/ai/conversations/:id deletes conversation', async () => {
    const res = await request(app)
      .delete(`/api/ai/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(200);

    // Verify it's gone
    const check = await request(app)
      .get(`/api/ai/conversations/${conversationId}`)
      .set('Authorization', `Bearer ${authToken}`);

    expect(check.status).toBe(404);
  });

  test('DELETE /api/ai/conversations/99999 returns 404', async () => {
    const res = await request(app)
      .delete('/api/ai/conversations/99999')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(404);
  });
});

// ─── Provider test endpoint ────────────────────────────────────────

describe('Provider test endpoint', () => {
  test('GET /api/ai/providers/invalid/test rejects unknown provider', async () => {
    const res = await request(app)
      .get('/api/ai/providers/invalid/test')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
  });

  test('GET /api/ai/providers/openai/test without key returns error', async () => {
    const res = await request(app)
      .get('/api/ai/providers/openai/test')
      .set('Authorization', `Bearer ${authToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});

// ─── Context builders ──────────────────────────────────────────────

describe('Context builders', () => {
  const { buildPortfolioContext, buildWatchlistContext, buildMarketContext } = require('../utils/ai-providers');
  const { dbAll, dbGet } = require('../db');

  test('buildPortfolioContext returns markdown', () => {
    // Get user by querying
    const user = dbGet("SELECT id FROM users WHERE username = 'aitest'");
    const ctx = buildPortfolioContext(user.id, dbAll, dbGet);
    expect(typeof ctx).toBe('string');
    // User may or may not have portfolios, but should return something
    expect(ctx.length).toBeGreaterThan(0);
  });

  test('buildWatchlistContext returns markdown', async () => {
    const user = dbGet("SELECT id FROM users WHERE username = 'aitest'");
    const ctx = await buildWatchlistContext(user.id, dbAll);
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  test('buildMarketContext returns markdown with date', () => {
    const ctx = buildMarketContext();
    expect(ctx).toContain('Market Context');
    expect(ctx).toContain('Date');
    expect(ctx).toContain('US Markets');
  });
});

// ─── AIProvider class ──────────────────────────────────────────────

describe('AIProvider class', () => {
  const { AIProvider } = require('../utils/ai-providers');

  test('getModels returns models for known provider', () => {
    const provider = new AIProvider('openai', {});
    const models = provider.getModels();
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
  });

  test('getDefaultModel returns first model', () => {
    const provider = new AIProvider('anthropic', {});
    const model = provider.getDefaultModel();
    expect(model).toBe('claude-sonnet-4-20250514');
  });

  test('getDefaultModel uses config model when set', () => {
    const provider = new AIProvider('openai', { model: 'gpt-4o-mini' });
    expect(provider.getDefaultModel()).toBe('gpt-4o-mini');
  });
});

// Cleanup handled by api.test.js afterAll
