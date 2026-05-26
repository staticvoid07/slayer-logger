const { escHtml } = require('./helpers');

function statCard(label, value, sub) {
  return `
  <div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:1rem 1.25rem;min-width:140px">
    <div style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">${label}</div>
    <div style="font-size:1.6rem;font-weight:700;color:#f9fafb">${value}</div>
    ${sub ? `<div style="font-size:0.75rem;color:#6b7280;margin-top:2px">${sub}</div>` : ''}
  </div>`;
}

function renderStats({ username, dateFrom, dateTo, usernames, stats }) {
  const usernameOptions = usernames
    .map(u => `<option value="${escHtml(u)}"${u === username ? ' selected' : ''}>${escHtml(u)}</option>`)
    .join('');

  let body = '';

  if (!username) {
    body = `<p style="color:#6b7280;margin-top:2rem;text-align:center">Select a player to view their stats.</p>`;
  } else if (!stats) {
    body = `<p style="color:#6b7280;margin-top:2rem;text-align:center">No data found.</p>`;
  } else {
    const {
      completedByMonster, assignedByMonster, taskCountByMonster, skippedByMonster,
      totalXp, totalPoints, latestTotalPoints, overallXpH, currentTask, gaps,
      totalCompleted, totalSkipped,
    } = stats;

    // Current task banner
    const currentTaskBanner = currentTask
      ? `<div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.25rem;display:flex;align-items:center;gap:1rem">
           <div>
             <div style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Current Task</div>
             <div style="font-size:1.25rem;font-weight:700;color:#f9fafb;text-transform:capitalize">${escHtml(currentTask.monster)}</div>
           </div>
           <div style="margin-left:auto;text-align:right">
             <div style="font-size:0.75rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px">Assigned</div>
             <div style="font-size:1.25rem;font-weight:700;color:#f9fafb">${currentTask.amount.toLocaleString()}</div>
           </div>
         </div>`
      : `<div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:1rem 1.25rem;margin-bottom:1.25rem;color:#6b7280;font-size:0.875rem">
           No active task
         </div>`;

    // Summary cards
    const cards = [
      statCard('Tasks Completed', totalCompleted.toLocaleString()),
      statCard('Tasks Skipped', totalSkipped.toLocaleString()),
      statCard('Total XP', totalXp > 0 ? totalXp.toLocaleString() : '—'),
      statCard('Avg XP/hr', overallXpH != null ? overallXpH.toLocaleString() : '—'),
      statCard('Points Earned', totalPoints.toLocaleString(), latestTotalPoints != null ? `${latestTotalPoints.toLocaleString()} total` : null),
      statCard('Streak Gaps', gaps.length.toLocaleString()),
    ].join('');

    // Completed per monster table
    const monsterRows = Object.entries(completedByMonster)
      .sort((a, b) => b[1].completions - a[1].completions)
      .map(([monster, d]) => {
        const taskCount = taskCountByMonster[monster] ?? 0;
        const pct = taskCount > 0 ? ((d.completions / taskCount) * 100).toFixed(1) : '100.0';
        const totalAssigned = (assignedByMonster[monster] ?? 0).toLocaleString();
        const isActive = currentTask && currentTask.monster.toLowerCase() === monster;
        return `
        <tr${isActive ? ' style="background:#052e16"' : ''}>
          <td style="text-transform:capitalize">${escHtml(monster)}</td>
          <td style="text-align:center">${taskCount}</td>
          <td style="text-align:center">${d.completions} (${pct}%)</td>
          <td style="text-align:center">${totalAssigned}</td>
          <td style="text-align:center">${d.kills.toLocaleString()}${assignedByMonster[monster] ? ` (${(d.kills / assignedByMonster[monster]).toFixed(2)})` : ''}</td>
          <td style="text-align:center">${d.xp > 0 ? d.xp.toLocaleString() : '—'}</td>
        </tr>`;
      })
      .join('');

    // Skipped-only monsters (assigned but never completed in this period)
    const skippedOnly = Object.entries(skippedByMonster)
      .filter(([m]) => !completedByMonster[m])
      .sort((a, b) => b[1] - a[1])
      .map(([monster, count]) => `
        <tr>
          <td style="text-transform:capitalize">${escHtml(monster)}</td>
          <td style="text-align:center">${taskCountByMonster[monster] ?? count}</td>
          <td style="text-align:center">0 (0%)</td>
          <td style="text-align:center">${(assignedByMonster[monster] ?? 0).toLocaleString()}</td>
          <td style="text-align:center">0 (0.00)</td>
          <td style="text-align:center">—</td>
        </tr>`)
      .join('');

    const gapsSection = gaps.length === 0
      ? `<p style="color:#22c55e;font-size:0.875rem">No gaps detected — all task streak numbers are accounted for.</p>`
      : `<p style="color:#f59e0b;font-size:0.875rem;margin-bottom:0.5rem">${gaps.length} missing streak number${gaps.length !== 1 ? 's' : ''} detected:</p>
         <div style="display:flex;flex-wrap:wrap;gap:6px">
           ${gaps.map(n => `<span style="background:#292524;border:1px solid #78350f;color:#fbbf24;padding:2px 10px;border-radius:9999px;font-size:0.8rem">#${n}</span>`).join('')}
         </div>`;

    body = `
      ${currentTaskBanner}
      <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:1.75rem">${cards}</div>

      <h2 style="font-size:1rem;font-weight:600;color:#f9fafb;margin-bottom:0.75rem">Tasks by Monster</h2>
      <div style="overflow-x:auto;margin-bottom:2rem">
        <table style="width:100%;border-collapse:collapse">
          <thead>
            <tr style="background:#1f2937">
              <th style="${thStyle()}text-align:left">Monster</th>
              <th style="${thStyle()}text-align:center">Tasks</th>
              <th style="${thStyle()}text-align:center">Completed</th>
              <th style="${thStyle()}text-align:center">Assigned</th>
              <th style="${thStyle()}text-align:center">Kills</th>
              <th style="${thStyle()}text-align:center">XP</th>
            </tr>
          </thead>
          <tbody>
            ${monsterRows || '<tr><td colspan="6" style="text-align:center;color:#4b5563;padding:2rem">No completed tasks</td></tr>'}
            ${skippedOnly}
          </tbody>
        </table>
      </div>

      <h2 style="font-size:1rem;font-weight:600;color:#f9fafb;margin-bottom:0.75rem">Streak Gap Analysis</h2>
      <div style="background:#1f2937;border:1px solid #374151;border-radius:8px;padding:1rem 1.25rem">
        ${gapsSection}
      </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Slayer Stats</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #111827; color: #e5e7eb; font-family: system-ui, sans-serif; font-size: 0.9rem; }
    h1 { font-size: 1.5rem; font-weight: 700; color: #f9fafb; }
    .header { background: #1f2937; border-bottom: 1px solid #374151; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    .nav { display:flex; gap:1rem; margin-left:auto; }
    .nav a { color:#9ca3af; text-decoration:none; font-size:0.875rem; }
    .nav a:hover { color:#f9fafb; }
    .nav a.active { color:#3b82f6; font-weight:600; }
    .container { max-width: 1200px; margin: 0 auto; padding: 1.5rem; }
    .filters { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; align-items: flex-end; }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; color: #9ca3af; }
    select, input { background: #1f2937; border: 1px solid #374151; color: #e5e7eb; padding: 6px 10px; border-radius: 6px; font-size: 0.875rem; }
    button { background: #3b82f6; color: #fff; border: none; padding: 7px 18px; border-radius: 6px; cursor: pointer; font-size: 0.875rem; align-self: flex-end; }
    button:hover { background: #2563eb; }
    td { padding: 10px 12px; border-bottom: 1px solid #1f2937; vertical-align: middle; }
    tr:hover td { background: #1a2332; }
    tr[style*="052e16"]:hover td { background: #064e24; }
  </style>
</head>
<body>
  <div class="header">
    <img style="height:32px;width:auto;image-rendering:pixelated" src="https://oldschool.runescape.wiki/images/Slayer_icon.png" alt="Slayer">
    <h1>Slayer Logger</h1>
    <nav class="nav">
      <a href="/">Events</a>
      <a href="/stats" class="active">Stats</a>
    </nav>
  </div>
  <div class="container">
    <form class="filters" method="get" action="/stats">
      <label>
        Player
        <select name="username">
          <option value="">Select player…</option>
          ${usernameOptions}
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
      <button type="submit">View Stats</button>
    </form>
    ${body}
  </div>
</body>
</html>`;
}

function thStyle() {
  return 'padding:10px 12px;font-size:0.78rem;color:#9ca3af;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #374151;';
}

module.exports = { renderStats };
