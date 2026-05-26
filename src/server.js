const express = require('express');
const { pool, init } = require('./db');
const { renderPage } = require('./ui');

const app = express();
app.use(express.json());

const VALID_TYPES = new Set(['new task', 'task reminder', 'task completed']);

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { username, timestamp, message_type, monster, amount, tasks, points } = body;

  if (!username || !timestamp || !message_type || !monster || amount == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!VALID_TYPES.has(message_type)) {
    return res.status(400).json({ error: `Unknown message_type: ${message_type}` });
  }

  if (!Number.isInteger(amount)) {
    return res.status(400).json({ error: 'amount must be an integer' });
  }

  let occurredAt;
  try {
    occurredAt = new Date(timestamp);
    if (isNaN(occurredAt.getTime())) throw new Error();
  } catch {
    return res.status(400).json({ error: 'Invalid timestamp' });
  }

  try {
    await pool.query(
      `INSERT INTO events (username, occurred_at, message_type, monster, amount, tasks, points, raw)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        username,
        occurredAt,
        message_type,
        monster,
        amount,
        tasks ?? null,
        points ?? null,
        JSON.stringify(body),
      ]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    console.error('DB insert failed:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/', async (req, res) => {
  try {
    const username = req.query.username || null;
    const type = req.query.type || null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 50;
    const offset = (page - 1) * limit;

    const conditions = [];
    const params = [];

    if (username) {
      params.push(username);
      conditions.push(`username = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`message_type = $${params.length}`);
    }
    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`occurred_at >= $${params.length}::date`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`occurred_at < ($${params.length}::date + interval '1 day')`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [eventsResult, countResult, usernamesResult] = await Promise.all([
      pool.query(
        `SELECT * FROM events ${where} ORDER BY occurred_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      ),
      pool.query(`SELECT COUNT(*) FROM events ${where}`, params),
      pool.query(`SELECT DISTINCT username FROM events ORDER BY username`),
    ]);

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const usernames = usernamesResult.rows.map(r => r.username);

    res.send(renderPage({
      events: eventsResult.rows,
      total,
      page,
      totalPages,
      username,
      type,
      dateFrom,
      dateTo,
      usernames,
    }));
  } catch (err) {
    console.error('Query failed:', err);
    res.status(500).send('Internal server error');
  }
});

const PORT = process.env.PORT || 3000;

init()
  .then(() => {
    app.listen(PORT, () => console.log(`Listening on :${PORT}`));
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
