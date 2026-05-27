function badge(type) {
  const map = {
    'new task':       ['#3b82f6', 'New Task'],
    'task completed': ['#22c55e', 'Completed'],
    'task skipped':   ['#78350f', 'Skipped', '#fde68a'],
    'cape perk proc': ['#7c3aed', 'Cape Perk'],
    'task reminder':  ['#f59e0b', 'Reminder'],
  };
  const [bg, label, color = '#fff'] = map[type] || ['#6b7280', type];
  return `<span style="background:${bg};color:${color};padding:2px 8px;border-radius:9999px;font-size:0.75rem;font-weight:600;white-space:nowrap">${label}</span>`;
}

function formatDate(d) {
  return new Date(d).toLocaleString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'UTC', timeZoneName: 'short',
  });
}

function timestampCell(e) {
  const receivedAt = new Date(e.received_at);
  const occurredAt = new Date(e.occurred_at);
  const diffMs = Math.abs(receivedAt - occurredAt);
  const diffMins = Math.round(diffMs / 60000);

  let warning = '';
  if (diffMs > 5 * 60 * 1000) {
    const sign = receivedAt > occurredAt ? '+' : '-';
    warning = ` <span title="Event timestamp was ${sign}${diffMins} min from when it was received (plugin: ${formatDate(occurredAt)})"
      style="cursor:help;color:#f59e0b;font-size:0.85rem">⚠</span>`;
  }
  return `<td>${formatDate(receivedAt)}${warning}</td>`;
}

function monsterLabel(e) {
  const name = e.monster ? `<span style="text-transform:capitalize">${escHtml(e.monster)}</span>` : '<span style="color:#6b7280">—</span>';
  const area = e.area ? ` <span style="font-size:0.72rem;color:#9ca3af;background:#374151;padding:1px 6px;border-radius:4px">${escHtml(e.area)}</span>` : '';
  return `<td>${name}${area}</td>`;
}

function row(e, skipTotalPoints) {
  const isSkip = e.message_type === 'task skipped';
  const isCape = e.message_type === 'cape perk proc';

  let pointsCell, taskCell, killsCell;

  if (e.message_type === 'task completed') {
    const pts = e.points != null && e.total_points != null
      ? `+${e.points} (${e.total_points.toLocaleString()})`
      : e.points != null ? `+${e.points}` : '—';
    const killCount = e.kills ?? e.amount;
    pointsCell = `<td style="text-align:center">${pts}</td>`;
    taskCell   = `<td style="text-align:center">${e.tasks ?? '—'}</td>`;
    killsCell  = `<td style="text-align:center">${killCount != null ? killCount.toLocaleString() : '—'}</td>`;
  } else if (isSkip) {
    // total_points on skip = running total after deduction
    const total = e.total_points != null ? e.total_points.toLocaleString() : (skipTotalPoints != null ? skipTotalPoints.toLocaleString() : null);
    const pts = total ? `-30 (${total})` : '-30';
    pointsCell  = `<td style="text-align:center;color:#ef4444">${pts}</td>`;
    taskCell    = `<td style="text-align:center">${e.tasks_completed ?? '—'}</td>`;
    killsCell   = `<td style="text-align:center">${e.amount != null ? e.amount.toLocaleString() : '—'}</td>`;
  } else if (isCape) {
    const total = e.total_points != null ? `(${e.total_points.toLocaleString()})` : '—';
    pointsCell  = `<td style="text-align:center;color:#a78bfa">${total}</td>`;
    taskCell    = `<td style="text-align:center">${e.tasks_completed ?? '—'}</td>`;
    killsCell   = `<td style="text-align:center">${e.amount != null ? e.amount.toLocaleString() : '—'}</td>`;
  } else {
    const newTaskPts = e.message_type === 'new task' && e.total_points != null ? `(${e.total_points.toLocaleString()})` : '—';
    pointsCell  = `<td style="text-align:center;color:#6b7280">${newTaskPts}</td>`;
    taskCell    = `<td style="text-align:center">—</td>`;
    killsCell   = `<td style="text-align:center">${e.amount != null ? e.amount.toLocaleString() : '—'}</td>`;
  }

  const rowStyle = isSkip ? ' style="background:#1c1008"' : isCape ? ' style="background:#1e1b2e"' : '';

  return `
  <tr${rowStyle}>
    ${timestampCell(e)}
    <td>${escHtml(e.username)}</td>
    <td>${badge(e.message_type)}</td>
    ${monsterLabel(e)}
    ${killsCell}
    ${taskCell}
    ${pointsCell}
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

  // skipTotals is a fallback for old events that predate the points field on task skipped.
  // New events carry e.points directly on the skip row.
  const skipTotals = new Array(events.length).fill(null);
  let pts = null;
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.message_type === 'task completed' && e.total_points != null) pts = e.total_points;
    if (e.message_type === 'task skipped' && e.points == null && pts != null) {
      pts -= 30;
      skipTotals[i] = pts;
    }
  }

  const rows = events.map((e, i) => row(e, skipTotals[i])).join('');

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
    .search-bar { margin-bottom: 0.75rem; }
    .search-bar input { width: 100%; padding: 7px 12px; font-size: 0.875rem; }
    tbody tr.hidden { display: none; }
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
          <option value="task completed"${type === 'task completed' ? ' selected' : ''}>Completed</option>
          <option value="task skipped"${type === 'task skipped' ? ' selected' : ''}>Skipped</option>
          <option value="cape perk proc"${type === 'cape perk proc' ? ' selected' : ''}>Cape Perk</option>
        </select>
      </label>
      <label>
        From (UTC)
        <input type="datetime-local" name="date_from" value="${escHtml(dateFrom || '')}">
      </label>
      <label>
        To (UTC)
        <input type="datetime-local" name="date_to" value="${escHtml(dateTo || '')}">
      </label>
      <button type="submit">Filter</button>
      <a class="reset" href="/">Clear</a>
    </form>
    <div class="stats">Showing ${events.length} of ${total} event${total !== 1 ? 's' : ''}</div>
    <div class="search-bar">
      <input type="search" id="rowSearch" placeholder="Search visible rows by any field…" oninput="filterRows(this.value)">
    </div>
    <table>
      <thead>
        <tr>
          <th>Time (UTC)</th>
          <th>Player</th>
          <th>Type</th>
          <th>Monster</th>
          <th style="text-align:center">Kills</th>
          <th style="text-align:center">Task #</th>
          <th style="text-align:center">Points</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="7" class="empty">No events found</td></tr>'}
      </tbody>
    </table>
    ${totalPages > 1 ? `<div class="pager">${pager.join('')}</div>` : ''}
  </div>
  <script>
    function filterRows(q) {
      const term = q.trim().toLowerCase();
      document.querySelectorAll('tbody tr').forEach(tr => {
        tr.classList.toggle('hidden', term !== '' && !tr.textContent.toLowerCase().includes(term));
      });
    }
  </script>
</body>
</html>`;
}

module.exports = { renderPage };
