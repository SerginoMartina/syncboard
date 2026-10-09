import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://syncboard:syncboard@localhost:5432/syncboard',
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

export const verifyDatabaseConnection = async () => pool.query('SELECT 1');
