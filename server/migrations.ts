import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
export interface MigrationClient { query(sql: string, params?: unknown[]): Promise<{ rows: { version?: string }[] }> }
export async function applyMigrations(client: MigrationClient, directory = path.resolve('database/migrations')): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(821754)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
    const files = (await readdir(directory)).filter((file) => /^\d+_.+\.sql$/.test(file)).sort();
    for (const file of files) {
      const version = file.replace(/\.sql$/, '');
      if (applied.has(version)) continue;
      await client.query(await readFile(path.join(directory, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES($1)', [version]);
      console.log(`Migrasi ${version} selesai.`);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
}
