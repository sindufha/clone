import { Pool, type PoolClient } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX || 3),
  idleTimeoutMillis: 15_000,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 20_000,
  query_timeout: 25_000,
});
pool.on('error', () => console.error('Koneksi idle database terputus. Permintaan berikutnya akan membuka koneksi baru.'));

export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}
