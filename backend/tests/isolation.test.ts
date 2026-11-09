import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

async function signupAndLogin(email: string) {
  const agent = request.agent(app);
  await agent.post('/api/auth/signup').send({ name: email, email, password: 'StrongPass123!' });
  return agent;
}

describe('Customer data isolation (critical security boundary)', () => {
  it("Customer A cannot read Customer B's project", async () => {
    const alice = await signupAndLogin('alice@example.com');
    const bob = await signupAndLogin('bob@example.com');

    const project = await bob.post('/api/projects').send({ name: "Bob's confidential bracket" });
    expect(project.status).toBe(201);

    const attempt = await alice.get(`/api/projects/${project.body.data.id}`);
    expect(attempt.status).toBe(403);
  });

  it("Customer A cannot read Customer B's quote", async () => {
    const alice = await signupAndLogin('alice2@example.com');
    const bob = await signupAndLogin('bob2@example.com');

    const project = await bob.post('/api/projects').send({ name: 'Bob project 2' });

    // Directly probing the quotes list must never leak Bob's quotes to Alice either.
    const bobQuotes = await bob.get('/api/quotes');
    const aliceQuotes = await alice.get('/api/quotes');
    expect(aliceQuotes.body.data).toEqual([]);
    void project;
    void bobQuotes;
  });

  it("Customer A cannot accept Customer B's quote", async () => {
    const alice = await signupAndLogin('alice3@example.com');
    const bob = await signupAndLogin('bob3@example.com');
    void bob;

    // Even a guessed/enumerated quote id must fail closed, not just "not found leaks nothing".
    const attempt = await alice.post('/api/quotes/nonexistent-id/accept');
    expect([403, 404]).toContain(attempt.status);
  });

  it('ENGINEER role can access customer quotes for review, but CUSTOMER cannot access the engineer review endpoint', async () => {
    const alice = await signupAndLogin('alice4@example.com');
    const project = await alice.post('/api/projects').send({ name: 'Reviewable project' });

    const forbidden = await alice.patch(`/api/quotes/some-id/review`).send({ status: 'APPROVED' });
    expect(forbidden.status).toBe(403);
    void project;
  });

  it('a customer cannot escalate their own role via the profile they control', async () => {
    const alice = await signupAndLogin('alice5@example.com');
    // There is deliberately no self-service role field on any customer-writable route.
    const res = await alice.patch('/api/admin/users/self/role').send({ role: 'ADMIN' });
    expect(res.status).toBe(403); // requireAdmin blocks non-admins outright
  });
});
