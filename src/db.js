const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PGHOST || 'db',
  port: parseInt(process.env.PGPORT || '5432'),
  database: process.env.PGDATABASE || 'slayer',
  user: process.env.PGUSER || 'slayer',
  password: process.env.PGPASSWORD,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id               BIGSERIAL PRIMARY KEY,
      username         TEXT        NOT NULL,
      occurred_at      TIMESTAMPTZ NOT NULL,
      message_type     TEXT        NOT NULL,
      monster          TEXT,
      amount           INTEGER,
      tasks            INTEGER,
      points           INTEGER,
      xp               INTEGER,
      total_points     INTEGER,
      area             TEXT,
      tasks_completed  INTEGER,
      slayer_master    INTEGER,
      raw              JSONB       NOT NULL,
      received_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE events ADD COLUMN IF NOT EXISTS xp INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS total_points INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS area TEXT;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS tasks_completed INTEGER;
    ALTER TABLE events ADD COLUMN IF NOT EXISTS slayer_master INTEGER;
    ALTER TABLE events ALTER COLUMN monster DROP NOT NULL;
    ALTER TABLE events ALTER COLUMN amount DROP NOT NULL;

    CREATE INDEX IF NOT EXISTS idx_events_username     ON events (username);
    CREATE INDEX IF NOT EXISTS idx_events_occurred_at  ON events (occurred_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_message_type ON events (message_type);
  `);
}

module.exports = { pool, init };
