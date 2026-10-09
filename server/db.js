import { readFile } from 'node:fs/promises';
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://syncboard:syncboard@localhost:5432/syncboard',
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export const initializeDatabase = async () => {
  await pool.query('SELECT 1');
  const schema = await readFile(new URL('./database/schema.sql', import.meta.url), 'utf8');
  await pool.query(schema);
};
