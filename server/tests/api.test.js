/**
 * API Integration Tests
 */

const request = require('supertest');
const path = require('path');
const fs = require('fs');

// Set test environment
process.env.JWT_SECRET = 'test-secret-key';
process.env.DATA_DIR = '/tmp/portfolio-tracker-test';

// Clean up test database before tests
beforeAll(() => {
  const dbPath = path.join(process.env.DATA_DIR, 'portfolio.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
  if (!fs.existsSync(process.env.DATA_DIR)) {
    fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
  }
});

// Import app after setting env vars
let app;
beforeAll(async () => {
  // Dynamic import to ensure env vars are set first
  const server = require('../index.js');
  app = server.app || require('express')();
  // Wait for DB init
  await new Promise(resolve => setTimeout(resolve, 1000));
});

describe('Health & Public Endpoints', () => {
  test('GET /api/tickers/popular returns ticker list', async () => {
    const res = await request(app).get('/api/tickers/popular');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('symbol');
    expect(res.body[0]).toHaveProperty('name');
  });

  test('GET /api/tickers/search returns results', async () => {
    const res = await request(app).get('/api/tickers/search?q=AAPL');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test('GET /api/news returns news items', async () => {
    const res = await request(app).get('/api/news?limit=3');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('items');
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

describe('Authentication', () => {
  const testUser = {
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPass123!'
  };
  let authToken;

  test('POST /api/auth/register creates new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.username).toBe(testUser.username);
    authToken = res.body.token;
  });

  test('POST /api/auth/register rejects duplicate user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send(testUser);
    
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('POST /api/auth/register validates password strength', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        username: 'weakpass',
        email: 'weak@example.com',
        password: '123'
      });
    
    expect(res.status).toBe(400);
  });

  test('POST /api/auth/login with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        login: testUser.username,
        password: testUser.password
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    authToken = res.body.token;
  });

  test('POST /api/auth/login with invalid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        login: testUser.username,
        password: 'wrongpassword'
      });
    
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me requires authentication', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('GET /api/auth/me returns user with valid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('username', testUser.username);
  });
});

describe('Portfolio Management', () => {
  let authToken;
  let portfolioId;

  beforeAll(async () => {
    // Login to get token
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        login: 'testuser',
        password: 'TestPass123!'
      });
    authToken = res.body.token;
  });

  test('GET /api/portfolios returns user portfolios', async () => {
    const res = await request(app)
      .get('/api/portfolios')
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    portfolioId = res.body[0].id;
  });

  test('POST /api/portfolios/:id/positions adds position', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        quantity: 10,
        entry_price: 150.00,
        type: 'stock'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id');
  });

  test('GET /api/portfolios/:id/positions returns positions', async () => {
    const res = await request(app)
      .get(`/api/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

describe('Input Validation', () => {
  let authToken;
  let portfolioId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ login: 'testuser', password: 'TestPass123!' });
    authToken = res.body.token;
    
    const portfolios = await request(app)
      .get('/api/portfolios')
      .set('Authorization', `Bearer ${authToken}`);
    portfolioId = portfolios.body[0].id;
  });

  test('Rejects invalid symbol format', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        symbol: '<script>alert(1)</script>',
        quantity: 10,
        entry_price: 100
      });
    
    expect(res.status).toBe(400);
  });

  test('Rejects negative quantity', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        symbol: 'AAPL',
        quantity: -10,
        entry_price: 100
      });
    
    expect(res.status).toBe(400);
  });

  test('Rejects oversized input', async () => {
    const res = await request(app)
      .post(`/api/portfolios/${portfolioId}/positions`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        symbol: 'AAPL',
        quantity: 10,
        entry_price: 100,
        notes: 'x'.repeat(10000)
      });
    
    expect(res.status).toBe(400);
  });
});

describe('Rate Limiting', () => {
  test('Auth endpoints are rate limited', async () => {
    // Make many requests quickly
    const requests = [];
    for (let i = 0; i < 15; i++) {
      requests.push(
        request(app)
          .post('/api/auth/login')
          .send({ login: 'nobody', password: 'wrong' })
      );
    }
    
    const responses = await Promise.all(requests);
    const tooManyRequests = responses.some(r => r.status === 429);
    
    // Should eventually get rate limited
    expect(tooManyRequests).toBe(true);
  });
});

// Cleanup
afterAll(async () => {
  // Clean up test database
  const dbPath = path.join(process.env.DATA_DIR, 'portfolio.db');
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});
