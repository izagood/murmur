import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { AccountView } from '@murmur/shared';
import { onEvent } from '../events.js';
import { listChannels } from '../services/channels.js';
import { listInbox, listMessages, postMessage, searchMessages } from '../services/messages.js';
import { emitEvent } from '../events.js';
import { dmMemberIds } from '../services/channels.js';
import { GUIDE } from './guide.js';

function jsonResult(value: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
}

function buildMcpServer(pool: Pool, account: AccountView): McpServer {
  const server = new McpServer({ name: 'murmur', version: '0.1.0' });

  server.registerTool('workspace.guide', { description: '워크스페이스 규칙(avcs 사용 경계 포함)' },
    async () => jsonResult({ guide: GUIDE }));

  server.registerTool('account.me', { description: '내 계정 정보' },
    async () => jsonResult(account));

  server.registerTool('channel.list', { description: '채널 목록' },
    async () => jsonResult({ channels: await listChannels(pool) }));

  server.registerTool('message.read', {
    description: '채널/스레드 메시지 읽기(seq 커서)',
    inputSchema: {
      channelId: z.string().uuid(),
      since: z.number().int().min(0).optional(),
      threadRootId: z.string().uuid().optional(),
    },
  }, async ({ channelId, since, threadRootId }) =>
    jsonResult({ messages: await listMessages(pool, channelId, { since, threadRootId: threadRootId ?? null }) }));

  server.registerTool('message.search', {
    description: '메시지 전문 검색',
    inputSchema: { query: z.string().min(1).max(256) },
  }, async ({ query }) => jsonResult({ messages: await searchMessages(pool, query) }));

  server.registerTool('message.post', {
    description: '채널 또는 스레드에 메시지 발화',
    inputSchema: {
      channelId: z.string().uuid(),
      body: z.string().min(1).max(8000),
      threadRootId: z.string().uuid().optional(),
    },
  }, async ({ channelId, body, threadRootId }) => {
    const { message, notified, replayed } = await postMessage(pool, {
      channelId, authorId: account.id, body, threadRootId: threadRootId ?? null,
    });
    if (!replayed) {
      const ch = await pool.query(`select kind from channel where id = $1`, [channelId]);
      const audience: 'all' | string[] = ch.rows[0]?.kind === 'dm' ? await dmMemberIds(pool, channelId) : 'all';
      emitEvent({ type: 'message.created', message, audience });
      for (const accountId of notified) emitEvent({ type: 'inbox.updated', accountId });
    }
    return jsonResult({ message });
  });

  server.registerTool('inbox.poll', {
    description: '미읽음 inbox 조회. timeoutMs>0이면 새 항목이 올 때까지 long-poll',
    inputSchema: { timeoutMs: z.number().int().min(0).max(25_000).optional() },
  }, async ({ timeoutMs }) => {
    const fetchUnread = async () => {
      const entries = await listInbox(pool, account.id, { unreadOnly: true });
      if (!entries.length) return { entries, messages: [] };
      const ids = entries.map((e) => e.messageId);
      const msgs = await pool.query(
        `select id, seq::int as seq, channel_id as "channelId", thread_root_id as "threadRootId",
           author_id as "authorId", body, kind, meta, created_at as "createdAt"
         from message where id = any($1) order by seq`, [ids]);
      return { entries, messages: msgs.rows };
    };
    let result = await fetchUnread();
    if (!result.entries.length && (timeoutMs ?? 0) > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { off(); resolve(); }, timeoutMs);
        const off = onEvent((e) => {
          if (e.type === 'inbox.updated' && e.accountId === account.id) {
            clearTimeout(timer); off(); resolve();
          }
        });
      });
      result = await fetchUnread();
    }
    return jsonResult(result);
  });

  server.registerTool('work.link', {
    description: 'intent를 기존 대화 스레드에 작업 스레드로 연결(명시 링크가 자동 개설을 이긴다)',
    inputSchema: {
      repo: z.string().min(1).max(128),
      intentOid: z.string().min(1).max(128),
      threadRootMessageId: z.string().uuid(),
    },
  }, async ({ repo, intentOid, threadRootMessageId }) => {
    await pool.query(
      `insert into work_thread (repo, intent_oid, thread_root_message_id) values ($1, $2, $3)
       on conflict (repo, intent_oid) do update set thread_root_message_id = excluded.thread_root_message_id`,
      [repo, intentOid, threadRootMessageId],
    );
    return jsonResult({ ok: true });
  });

  return server;
}

export async function registerMcp(app: FastifyInstance, pool: Pool): Promise<void> {
  app.post('/mcp', async (req, reply) => {
    if (!req.account || req.account.kind !== 'agent') {
      return reply.code(req.account ? 403 : 401)
        .send({ error: { code: 'agent_only', message: 'MCP surface requires an agent PAT' } });
    }
    const server = buildMcpServer(pool, req.account);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    reply.hijack();
    await server.connect(transport);
    await transport.handleRequest(req.raw, reply.raw, req.body);
  });
}
