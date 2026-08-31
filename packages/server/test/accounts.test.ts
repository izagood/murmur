import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startTestDb } from './helpers/testDb.js';
import { buildServer } from '../src/buildServer.js';
import { bootstrapAdmin, createAgent } from './helpers/fixtures.js';

let app: FastifyInstance;
let stop: () => Promise<void>;
let adminToken: string;

beforeAll(async () => {
  const db = await startTestDb();
  stop = db.stop;
  app = await buildServer({ pool: db.pool });
  ({ token: adminToken } = await bootstrapAdmin(app));
});
afterAll(async () => { await app.close(); await stop(); });

describe('invites', () => {
  it('admin invite → register → login works, invite is single-use', async () => {
    const inv = await app.inject({
      method: 'POST', url: '/invites', headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(inv.statusCode).toBe(201);
    const inviteToken = inv.json().token as string;

    const reg = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { inviteToken, handle: 'friend', displayName: 'Friend', password: 'pw123456' },
    });
    expect(reg.statusCode).toBe(201);

    const again = await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { inviteToken, handle: 'other', displayName: 'O', password: 'pw123456' },
    });
    expect(again.statusCode).toBe(400);
  });
});

describe('agents', () => {
  it('creates agent, PAT authenticates as agent, key registered', async () => {
    const { accountId, pat } = await createAgent(app, adminToken, 'bot1');
    const me = await app.inject({
      method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${pat}` },
    });
    expect(me.json()).toMatchObject({ handle: 'bot1', kind: 'agent', isAdmin: false });

    const key = await app.inject({
      method: 'PUT', url: `/accounts/${accountId}/keys`,
      headers: { authorization: `Bearer ${pat}` },
      payload: { keyId: 'k1', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nMCow...\n-----END PUBLIC KEY-----' },
    });
    expect(key.statusCode).toBe(204);
  });

  it('non-admin cannot create agents', async () => {
    const { pat } = await createAgent(app, adminToken, 'bot2');
    const res = await app.inject({
      method: 'POST', url: '/accounts/agents', headers: { authorization: `Bearer ${pat}` },
      payload: { handle: 'bot3', displayName: 'x' },
    });
    expect(res.statusCode).toBe(403);
  });
});
