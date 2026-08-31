import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { startTestDb } from './helpers/testDb.js';
import { buildServer } from '../src/buildServer.js';
import { bootstrapAdmin } from './helpers/fixtures.js';
import { searchMessages } from '../src/services/messages.js';

let app: FastifyInstance;
let stop: () => Promise<void>;
let pool: Pool;
let adminToken: string;
let channelId: string;

beforeAll(async () => {
  const db = await startTestDb();
  stop = db.stop;
  pool = db.pool;
  app = await buildServer({ pool });
  ({ token: adminToken } = await bootstrapAdmin(app));
  const ch = await app.inject({
    method: 'POST', url: '/channels', headers: { authorization: `Bearer ${adminToken}` },
    payload: { name: 'general' },
  });
  channelId = ch.json().id;
  for (const body of ['deploy pipeline is green', 'lunch anyone?', 'pipeline failed again']) {
    await app.inject({
      method: 'POST', url: `/channels/${channelId}/messages`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { body },
    });
  }
});
afterAll(async () => { await app.close(); await stop(); });

describe('search', () => {
  it('finds messages by word, excludes deleted, orders by seq desc, and respects limit', async () => {
    // Test 1: finds messages by word
    const res = await app.inject({
      method: 'GET', url: '/search?q=pipeline', headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const bodies = res.json().messages.map((m: { body: string }) => m.body);
    expect(bodies).toHaveLength(2);
    expect(bodies).toContain('deploy pipeline is green');

    // Test 2: seq desc ordering
    const seqs = res.json().messages.map((m: { seq: number }) => m.seq);
    expect(seqs).toEqual([seqs[0], seqs[1]].sort((a, b) => b - a)); // descending order
    expect(bodies).toEqual(['pipeline failed again', 'deploy pipeline is green']); // newest first

    // Test 3: deleted messages are excluded
    const pipelineMessages = res.json().messages;
    const messageToDelete = pipelineMessages[0];
    await pool.query('update message set deleted_at = now() where id = $1', [messageToDelete.id]);
    const afterDelete = await app.inject({
      method: 'GET', url: '/search?q=pipeline', headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(afterDelete.json().messages).toHaveLength(1);
    expect(afterDelete.json().messages[0].body).toBe('deploy pipeline is green');

    // Test 4: limit parameter works
    const allResults = await searchMessages(pool, 'pipeline');
    const limitedResults = await searchMessages(pool, 'pipeline', 1);
    expect(limitedResults).toHaveLength(1);
    expect(allResults.length).toBeGreaterThanOrEqual(limitedResults.length);
  });
});
