import { Router } from 'express';
import { all, get, run, getSetting, setSetting, pointsBalance } from '../db.js';
import { requireAuth, requireDirector, isDirector } from '../auth.js';
import { today, nowLocal } from '../util.js';
import { config } from '../config.js';
import { sendDiscord } from '../discord.js';

const r = Router();

r.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

r.use(['/notifications', '/settings', '/dashboard'], requireAuth);

// ——— Уведомления ———
r.get('/notifications', (req, res) => {
  res.json({
    items: all('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 100', req.user.id),
    unread: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', req.user.id).n,
  });
});
r.post('/notifications/read', (req, res) => {
  if (req.body?.id) run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', req.body.id, req.user.id);
  else run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

// ——— Настройки ———
const PUBLIC_SETTINGS = ['points_rate_cents', 'min_exchange_points', 'checklist_points', 'zones'];
r.get('/settings', (_req, res) => {
  const s = Object.fromEntries(PUBLIC_SETTINGS.map((k) => [k, getSetting(k)]));
  s.zones = JSON.parse(s.zones || '[]');
  s.integrations = {
    discord_bookings: !!config.discord.bookings,
    discord_general: !!config.discord.general,
    shifts_sheet: !!config.shiftsCsvUrl,
    tilda: !!config.tildaToken,
  };
  res.json(s);
});
r.patch('/settings', requireDirector, (req, res) => {
  for (const k of PUBLIC_SETTINGS) {
    if (req.body?.[k] === undefined) continue;
    setSetting(k, k === 'zones' ? JSON.stringify(req.body[k]) : req.body[k]);
  }
  res.json({ ok: true });
});
r.post('/settings/discord-test', requireDirector, async (_req, res) => {
  const a = await sendDiscord('general', { title: '✅ CyberHub Control подключён', description: 'Тестовое сообщение — общий канал' });
  const b = await sendDiscord('bookings', { title: '✅ CyberHub Control подключён', description: 'Тестовое сообщение — канал броней' });
  res.json({ general: a, bookings: b });
});

// ——— Главный экран ———
r.get('/dashboard', (req, res) => {
  const d = today();
  const me = req.user.id;
  const director = isDirector(req);
  const myTaskFilter = director ? '' : 'AND (assignee_id = ? OR assignee_id IS NULL)';
  const tp = director ? [] : [me];
  res.json({
    date: d,
    shiftsToday: all(`SELECT s.*, u.name AS user_name FROM shifts s LEFT JOIN users u ON u.id = s.user_id WHERE s.date = ? ORDER BY s.start_time`, d),
    myNextShift: get(`SELECT * FROM shifts WHERE user_id = ? AND date >= ? ORDER BY date, start_time LIMIT 1`, me, d) || null,
    checklist: get(`SELECT r.id, r.status, (SELECT COUNT(*) FROM checklist_results x WHERE x.run_id = r.id AND x.done = 1) AS done,
                    (SELECT COUNT(*) FROM checklist_items WHERE active = 1) AS total
                    FROM checklist_runs r WHERE r.user_id = ? AND r.date = ? ORDER BY r.id DESC LIMIT 1`, me, d) || {
      status: 'not_started', done: 0, total: get('SELECT COUNT(*) AS n FROM checklist_items WHERE active = 1').n,
    },
    tasks: {
      active: get(`SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open','in_progress','rejected') ${myTaskFilter}`, ...tp).n,
      overdue: get(`SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open','in_progress','rejected') AND deadline IS NOT NULL AND deadline < ? ${myTaskFilter}`,
        nowLocal(), ...tp).n,
      review: get(`SELECT COUNT(*) AS n FROM tasks WHERE status = 'review'`).n,
      top: all(`SELECT t.id, t.title, t.priority, t.deadline, t.zone, t.status, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
                WHERE t.status IN ('open','in_progress','rejected') ${myTaskFilter.replace(/assignee_id/g, 't.assignee_id')}
                ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.deadline IS NULL, t.deadline LIMIT 5`, ...tp),
    },
    bookings: {
      new: get(`SELECT COUNT(*) AS n FROM bookings WHERE status = 'new'`).n,
      oldestNew: get(`SELECT MIN(created_at) AS t FROM bookings WHERE status = 'new'`).t,
      latest: all(`SELECT id, name, date, time, guests, source, status FROM bookings WHERE status IN ('new','confirmed') ORDER BY id DESC LIMIT 4`),
    },
    breakdownsOpen: get(`SELECT COUNT(*) AS n FROM breakdowns WHERE status != 'fixed'`).n,
    breakdownsCritical: get(`SELECT COUNT(*) AS n FROM breakdowns WHERE status != 'fixed' AND severity = 'critical'`).n,
    cashReportToday: !!get('SELECT 1 FROM cash_reports WHERE date = ? AND user_id = ?', d, me),
    points: pointsBalance(me),
    approvals: director ? {
      advances: get(`SELECT COUNT(*) AS n FROM advances WHERE status = 'pending'`).n,
      exchanges: get(`SELECT COUNT(*) AS n FROM exchanges WHERE status = 'pending'`).n,
      cash: get(`SELECT COUNT(*) AS n FROM cash_reports WHERE status = 'submitted'`).n,
    } : null,
  });
});

export default r;
