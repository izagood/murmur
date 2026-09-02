import type { Pool } from 'pg';

export async function recordRunnerVersion(pool: Pool, accountId: string, version: string): Promise<void> {
  await pool.query(
    `insert into agent_runner_version (account_id, version, seen_at)
     values ($1, $2, now())
     on conflict (account_id) do update set version = excluded.version, seen_at = excluded.seen_at`,
    [accountId, version],
  );
}