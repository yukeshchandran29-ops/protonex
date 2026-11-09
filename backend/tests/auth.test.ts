import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Authentication', () => {
  it('signs up a new customer and issues a session cookie', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test User',
      email: 'test.user@example.com',
      password: 'StrongPass123!',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.role).toBe('CUSTOMER');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('rejects duplicate signups without confirming account existence', async () => {
    await request(app).post('/api/auth/signup').send({
      name: 'Test User',
      email: 'dupe@example.com',
      password: 'StrongPass123!',
    });
    const res = await request(app).post('/api/auth/signup').send({
      name: 'Test User',
      email: 'dupe@example.com',
      password: 'StrongPass123!',
    });
    expect(res.status).toBe(409);
  });

  it('rejects login with wrong password using a generic error', async () => {
    await request(app).post('/api/auth/signup').send({
      name: 'Login Test',
      email: 'login.test@example.com',
      password: 'StrongPass123!',
    });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login.test@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after repeated failed logins', async () => {
    await request(app).post('/api/auth/signup').send({
      name: 'Lockout Test',
      email: 'lockout@example.com',
      password: 'StrongPass123!',
    });
    let res;
    for (let i = 0; i < 5; i++) {
      res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'lockout@example.com', password: 'wrongpassword' });
    }
    const finalAttempt = await request(app)
      .post('/api/auth/login')
      .send({ email: 'lockout@example.com', password: 'StrongPass123!' });
    expect(finalAttempt.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('rejects unauthenticated access to /me', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
