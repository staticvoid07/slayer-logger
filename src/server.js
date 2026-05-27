const express = require('express');
const { pool, init } = require('./db');
const { renderPage } = require('./ui');
const { renderStats } = require('./stats');

const app = express();
app.use(express.json());

const VALID_TYPES = new Set(['new task', 'task completed', 'task skipped', 'cape perk proc', 'task reminder']);

app.post('/webhook', async (req, res) => {
  const body = req.body;

  if (!body || typeof body !== 'object') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const {
    username, timestamp, message_type,
    monster, amount, kills, tasks, points, xp, total_points,
    area, tasks_completed, slayer_master,
  } = body;

  if (!username || !timestamp || !message_type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!VALID_TYPES.has(message_type)) {
    return res.status(400).json({ error: `Unknown message_type: ${message_type}` });
  }

  if (amount != null && !Number.isInteger(amount)) {
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
      `INSERT INTO events
         (username, occurred_at, message_type, monster, amount, kills, tasks, points, xp, total_points, area, tasks_completed, slayer_master, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        username,
        occurredAt,
        message_type,
        monster ?? null,
        amount ?? null,
        kills ?? null,
        tasks ?? null,
        points ?? null,
        xp ?? null,
        total_points ?? null,
        area || null,
        tasks_completed ?? null,
        slayer_master ?? null,
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
    const dateFrom = req.query.date_from ? req.query.date_from + 'Z' : null;
    const dateTo = req.query.date_to ? req.query.date_to + 'Z' : null;
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
      conditions.push(`occurred_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`occurred_at <= $${params.length}::timestamptz`);
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
      dateFrom: dateFrom ? dateFrom.slice(0, -1) : null,
      dateTo: dateTo ? dateTo.slice(0, -1) : null,
      usernames,
    }));
  } catch (err) {
    console.error('Query failed:', err);
    res.status(500).send('Internal server error');
  }
});

app.get('/stats', async (req, res) => {
  try {
    const username = req.query.username || null;
    const dateFrom = req.query.date_from ? req.query.date_from + 'Z' : null;
    const dateTo = req.query.date_to ? req.query.date_to + 'Z' : null;

    const usernamesResult = await pool.query(
      `SELECT DISTINCT username FROM events ORDER BY username`
    );
    const usernames = usernamesResult.rows.map(r => r.username);

    if (!username) {
      return res.send(renderStats({
        username: null,
        dateFrom: dateFrom ? dateFrom.slice(0, -1) : null,
        dateTo: dateTo ? dateTo.slice(0, -1) : null,
        usernames,
        stats: null,
      }));
    }

    const conditions = [`username = $1`];
    const params = [username];

    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`occurred_at >= $${params.length}::timestamptz`);
    }
    if (dateTo) {
      params.push(dateTo);
      conditions.push(`occurred_at <= $${params.length}::timestamptz`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    // Fetch all relevant events for this player in order
    const { rows: events } = await pool.query(
      `SELECT * FROM events ${where} ORDER BY occurred_at ASC`,
      params
    );

    // --- Completed tasks: kills, xp, and duration per monster ---
    const completedByMonster = {};
    let totalXp = 0;
    let totalPoints = 0;
    let latestTotalPoints = null;
    let totalTaskMs = 0;   // sum of milliseconds spent on completed tasks
    let timedTasks = 0;    // number of tasks we have a duration for
    const completedStreaks = [];

    // Build a map of pending task start times keyed by monster (lowercase)
    const pendingStart = {};
    const assignedByMonster = {};
    const taskCountByMonster = {};
    const skippedByMonster = {};
    let capeProcs = 0;

    for (const e of events) {
      if (e.message_type === 'new task') {
        const m = e.monster.toLowerCase();
        assignedByMonster[m] = (assignedByMonster[m] ?? 0) + e.amount;
        taskCountByMonster[m] = (taskCountByMonster[m] ?? 0) + 1;
        pendingStart[m] = new Date(e.occurred_at).getTime();
      } else if (e.message_type === 'task completed') {
        const m = e.monster.toLowerCase();
        if (!completedByMonster[m]) completedByMonster[m] = { kills: 0, assigned: 0, xp: 0, completions: 0, taskMs: 0, timedTasks: 0 };
        completedByMonster[m].kills += e.kills ?? e.amount ?? 0;
        completedByMonster[m].assigned += e.amount ?? 0;
        completedByMonster[m].xp += e.xp ?? 0;
        completedByMonster[m].completions += 1;
        totalXp += e.xp ?? 0;
        totalPoints += e.points ?? 0;
        if (e.total_points != null) latestTotalPoints = e.total_points;
        if (e.tasks != null) completedStreaks.push(e.tasks);

        if (pendingStart[m] != null && e.xp != null) {
          const ms = new Date(e.occurred_at).getTime() - pendingStart[m];
          if (ms > 0) {
            completedByMonster[m].taskMs += ms;
            completedByMonster[m].timedTasks += 1;
            totalTaskMs += ms;
            timedTasks += 1;
          }
        }
        delete pendingStart[m];
      } else if (e.message_type === 'task skipped') {
        const m = e.monster.toLowerCase();
        skippedByMonster[m] = (skippedByMonster[m] ?? 0) + 1;
        if (e.total_points != null) latestTotalPoints = e.total_points;
      } else if (e.message_type === 'cape perk proc') {
        capeProcs++;
        if (e.total_points != null) latestTotalPoints = e.total_points;
      }
    }

    // --- Gap detection: missing streak numbers ---
    const sortedStreaks = [...new Set(completedStreaks)].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < sortedStreaks.length; i++) {
      const prev = sortedStreaks[i - 1];
      const curr = sortedStreaks[i];
      for (let missing = prev + 1; missing < curr; missing++) {
        gaps.push(missing);
      }
    }


    const overallXpH = timedTasks > 0
      ? Math.round(totalXp / (totalTaskMs / 3_600_000))
      : null;

    // --- Current task: most recent new task in the filtered range with no completion after it ---
    const { rows: recentEvents } = await pool.query(
      `SELECT message_type, monster, amount, occurred_at
       FROM events ${where} ORDER BY occurred_at DESC LIMIT 50`,
      params
    );
    let currentTask = null;
    for (const e of recentEvents) {
      if (e.message_type === 'task completed' || e.message_type === 'task skipped') break;
      if (e.message_type === 'new task') { currentTask = e; break; }
    }

    const stats = {
      completedByMonster,
      assignedByMonster,
      taskCountByMonster,
      skippedByMonster,
      totalXp,
      totalPoints,
      latestTotalPoints,
      overallXpH,
      currentTask,
      capeProcs,
      gaps,
      totalCompleted: completedStreaks.length,
      totalSkipped: Object.values(skippedByMonster).reduce((a, b) => a + b, 0),
    };

    res.send(renderStats({
      username,
      dateFrom: dateFrom ? dateFrom.slice(0, -1) : null,
      dateTo: dateTo ? dateTo.slice(0, -1) : null,
      usernames,
      stats,
    }));
  } catch (err) {
    console.error('Stats query failed:', err);
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
