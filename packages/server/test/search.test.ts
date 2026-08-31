import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { startTestDb } from './helpers/testDb.js';
import { buildServer } from '../src/buildServer.js';
import { bootstrapAdmin } from './helpers/fixtures.js';

let app: FastifyInstance;
let stop: () => Promise<void>;
let adminToken: string;

beforeAll(async () => {
  const db = await startTestDb();
  stop = db.stop;
  app = await buildServer({ pool: db.pool });
  ({ token: adminToken } = await bootstrapAdmin(app));
  const ch = await app.inject({
    method: 'POST', url: '/channels', headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: 'general' },
  });
  const channelId = ch.json().id;
  for (const body of ['deploy pipeline is green', 'lunch anyone?', 'pipeline failed again']) {
    await app.inject({
      method: 'POST', url: `/channels/${channelId}/messages`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { body },
    });
  }
});
afterAll(async () => { await app.close(); await stop(); });

describe('search', () => {
  it('finds messages by word', async () => {
    const res = await app.inject({
      method: 'GET', url: '/search?q=pipeline', headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const bodies = res.json().messages.map((m: { body: string }) => m.body);
    expect(bodies).toHaveLength(2);
    expect(bodies).toContain('deploy pipeline is green');
  });
});
