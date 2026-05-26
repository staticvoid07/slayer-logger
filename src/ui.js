function badge(type) {
  const map = {
    'new task':       ['#3b82f6', 'New Task'],
    'task reminder':  ['#f59e0b', 'Reminder'],
    'task completed': ['#22c55e', 'Completed'],
  };
  const [color, label] = map[type] || ['#6b7280', type];
  return `<span style="background:${color};color:#fff;padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap">${label}</span>`;
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

function row(e) {
  const extra = e.message_type === 'task completed'
    ? `<td style="text-align:center">${e.tasks ?? '—'}</td><td style="text-align:center">${e.points ?? '—'}</td>`
    : `<td style="text-align:center">—</td><td style="text-align:center">—</td>`;

  return `
  <tr>
    <td>${formatDate(e.occurred_at)}</td>
    <td>${escHtml(e.username)}</td>
    <td>${badge(e.message_type)}</td>
    <td style="text-transform:capitalize">${escHtml(e.monster)}</td>
    <td style="text-align:center">${e.amount}</td>
    ${extra}
  </tr>`;
}

const { escHtml } = require('./helpers');

function pagerLink(page, label, current, query) {
  const q = new URLSearchParams({ ...query, page });
  const active = page === current;
  return `<a href="/?${q}" style="padding:4px 10px;border-radius:4px;border:1px solid #374151;background:${active ? '#3b82f6' : '#1f2937'};color:${active ? '#fff' : '#d1d5db'};text-decoration:none">${label}</a>`;
}

function renderPage({ events, total, page, totalPages, username, type, dateFrom, dateTo, usernames }) {
  const query = {};
  if (username) query.username = username;
  if (type) query.type = type;
  if (dateFrom) query.date_from = dateFrom;
  if (dateTo) query.date_to = dateTo;

  const pager = [];
  if (page > 1) pager.push(pagerLink(page - 1, '&laquo; Prev', page, query));
  for (let p = Math.max(1, page - 2); p <= Math.min(totalPages, page + 2); p++) {
    pager.push(pagerLink(p, p, page, query));
  }
  if (page < totalPages) pager.push(pagerLink(page + 1, 'Next &raquo;', page, query));

  const usernameOptions = usernames
    .map(u => `<option value="${escHtml(u)}"${u === username ? ' selected' : ''}>${escHtml(u)}</option>`)
    .join('');

  const rows = events.map(row).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Slayer Logger</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #e5e7eb; font-family: system-ui, sans-serif; font-size: 0.9rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #f9fafb; }
    .header { background: #1f2937; border-bottom: 1px solid #374151; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    .skull { height: 32px; width: auto; image-rendering: pixelated; }
    .nav { display:flex; gap:1rem; margin-left:auto; }
    .nav a { color:#9ca3af; text-decoration:none; font-size:0.875rem; }
    .nav a:hover { color:#f9fafb; }
    .nav a.active { color:#3b82f6; font-weight:600; }
    .container { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.25rem; align-items: flex-end; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #9ca3af; }
    select, input { background: #1f2937; border: 1px solid #374151; color: #e5e7eb; padding: 6px 10px; border-radius: 6px; font-size: 0.875rem; }
    button { background: #3b82f6; color: #fff; border: none; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 0.875rem; align-self: flex-end; }
    button:hover { background: #2563eb; }
    a.reset { color: #9ca3af; font-size: 0.8rem; align-self: flex-end; padding-bottom: 7px; }
    .stats { color: #6b7280; margin-bottom: 1rem; font-size: 0.82rem; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #1f2937; }
    th { text-align: left; padding: 10px 12px; font-size: 0.78rem; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #374151; }
    td { padding: 10px 12px; border-bottom: 1px solid #1f2937; vertical-align: middle; }
    tr:hover td { background: #1a2332; }
    .pager { display: flex; gap: 6px; justify-content: center; margin-top: 1.5rem; flex-wrap: wrap; }
    .empty { text-align: center; color: #4b5563; padding: 3rem 0; }
  </style>
</head>
<body>
  <div class="header">
    <img class="skull" src="https://oldschool.runescape.wiki/images/Slayer_icon.png" alt="Slayer">
    <h1>Slayer Logger</h1>
    <nav class="nav">
      <a href="/" class="active">Events</a>
      <a href="/stats">Stats</a>
    </nav>
  </div>
  <div class="container">
    <form class="filters" method="get" action="/">
      <label>
        Player
        <select name="username">
          <option value="">All players</option>
          ${usernameOptions}
        </select>
      </label>
      <label>
        Event type
        <select name="type">
          <option value=""${!type ? ' selected' : ''}>All types</option>
          <option value="new task"${type === 'new task' ? ' selected' : ''}>New Task</option>
          <option value="task reminder"${type === 'task reminder' ? ' selected' : ''}>Reminder</option>
          <option value="task completed"${type === 'task completed' ? ' selected' : ''}>Completed</option>
        </select>
      </label>
      <label>
        From
        <input type="date" name="date_from" value="${escHtml(dateFrom || '')}">
      </label>
      <label>
        To
        <input type="date" name="date_to" value="${escHtml(dateTo || '')}">
      </label>
      <button type="submit">Filter</button>
      <a class="reset" href="/">Clear</a>
    </form>
    <div class="stats">Showing ${events.length} of ${total} event${total !== 1 ? 's' : ''}</div>
    <table>
      <thead>
        <tr>
          <th>Time (UTC)</th>
          <th>Player</th>
          <th>Type</th>
          <th>Monster</th>
          <th style="text-align:center">Amount</th>
          <th style="text-align:center">Tasks</th>
          <th style="text-align:center">Points</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="empty">No events found</td></tr>'}
      </tbody>
    </table>
    ${totalPages > 1 ? `<div class="pager">${pager.join('')}</div>` : ''}
  </div>
</body>
</html>`;
}

module.exports = { renderPage };
