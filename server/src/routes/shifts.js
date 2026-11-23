import { Router } from 'express';
import { all, run, getSetting } from '../db.js';
import { requireAuth, requireDirector } from '../auth.js';
import { syncShifts } from '../shiftsSync.js';
import { required, today } from '../util.js';
import { config } from '../config.js';

const r = Router();
r.use('/shifts', requireAuth);

r.get('/shifts', (req, res) => {
  const from = req.query.from || today();
  const to = req.query.to || from;
  const rows = all(
    `SELECT s.*, u.name AS user_name FROM shifts s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.date BETWEEN ? AND ? ORDER BY s.date, s.start_time`, from, to,
  );
  res.json({ shifts: rows, lastSync: getSetting('shifts_last_sync'), sheetConfigured: !!config.shiftsCsvUrl });
});

r.post('/shifts/sync', requireDirector, async (_req, res) => {
  res.json(await syncShifts());
});

// Ручное добавление (если таблица недоступна или замена в последний момент)
r.post('/shifts', requireDirector, (req, res) => {
  const b = req.body || {};
  required(b, ['date', 'start_time', 'end_time', 'user_id']);
  const u = all('SELECT name FROM users WHERE id = ?', b.user_id)[0];
  run(`INSERT OR REPLACE INTO shifts (user_id, employee_name, date, start_time, end_time, note, source) VALUES (?, ?, ?, ?, ?, ?, 'manual')`,
    b.user_id, u?.name || '—', b.date, b.start_time, b.end_time, b.note || null);
  res.json({ ok: true });
});

r.delete('/shifts/:id', requireDirector, (req, res) => {
  run('DELETE FROM shifts WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default r;
