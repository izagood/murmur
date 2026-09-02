import type { Pool } from 'pg';

export const MAX_MEMORY_VALUE_LENGTH = 8000;
export const MAX_MEMORY_ITEMS_PER_ACCOUNT = 200;

export interface MemoryEntry {
  slug: string;
  value: string;
  updatedAt: Date;
}

export type MemoryResult = 'ok' | 'not_found' | 'too_many';

export async function listMemory(pool: Pool, accountId: string): Promise<string[]> {
  const res = await pool.query(
    `select slug from agent_memory where account_id = $1 order by slug`,
    [accountId],
  );
  return res.rows.map((r) => r.slug as string);
}

export async function getMemory(
  pool: Pool, accountId: string, slug: string,
): Promise<MemoryEntry | null> {
  const res = await pool.query(
    `select slug, value, updated_at as "updatedAt" from agent_memory where account_id = $1 and slug = $2`,
    [accountId, slug],
  );
  if (!res.rowCount) return null;
  return res.rows[0] as MemoryEntry;
}

export async function setMemory(
  pool: Pool, accountId: string, slug: string, value: string | null,
): Promise<MemoryResult> {
  if (value === null) {
    const del = await pool.query(
      `delete from agent_memory where account_id = $1 and slug = $2 returning 1`,
      [accountId, slug],
    );
    return del.rowCount ? 'ok' : 'not_found';
  }

  const existing = await pool.query(
    `select 1 from agent_memory where account_id = $1 and slug = $2`,
    [accountId, slug],
  );
  if (!existing.rowCount) {
    const count = await pool.query(
      `select count(*) as cnt from agent_memory where account_id = $1`,
      [accountId],
    );
    if (parseInt(count.rows[0].cnt, 10) >= MAX_MEMORY_ITEMS_PER_ACCOUNT) {
      return 'too_many';
    }
  }

  await pool.query(
    `insert into agent_memory (account_id, slug, value) values ($1, $2, $3)
     on conflict (account_id, slug) do update set value = excluded.value, updated_at = now()`,
    [accountId, slug, value],
  );
  return 'ok';
}