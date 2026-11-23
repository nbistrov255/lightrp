import { Router } from 'express';
import { all, get, run, tx, getSetting } from '../db.js';
import { requireAuth, requireDirector, isDirector } from '../auth.js';
import { upload, savePhotos, photosFor } from '../uploads.js';
import { notifyRole } from '../notify.js';
import { required, httpError, today, bool } from '../util.js';

const r = Router();
r.use('/checklist', requireAuth);

function runPayload(runRow) {
  const items = all(
    `SELECT i.id AS item_id, i.title, i.zone, i.photo_required, COALESCE(cr.done,0) AS done, cr.note, cr.id AS result_id
     FROM checklist_items i
     LEFT JOIN checklist_results cr ON cr.item_id = i.id AND cr.run_id = ?
     WHERE i.active = 1 OR cr.id IS NOT NULL
     ORDER BY i.sort, i.id`, runRow.id,
  );
  const ph = photosFor('checklist_item', items.filter((i) => i.result_id).map((i) => i.result_id));
  return { ...runRow, items: items.map((i) => ({ ...i, photos: ph[i.result_id] || [] })) };
}

// Текущий чек-лист смены (создаётся при первом открытии)
r.get('/checklist/today', (req, res) => {
  const d = today();
  let row = get(`SELECT * FROM checklist_runs WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1`, req.user.id, d);
  if (!row) {
    const info = run('INSERT INTO checklist_runs (user_id, date) VALUES (?, ?)', req.user.id, d);
    row = get('SELECT * FROM checklist_runs WHERE id = ?', info.lastInsertRowid);
  }
  res.json(runPayload(row));
});

r.get('/checklist/runs', (req, res) => {
  const rows = all(
    `SELECT r.*, u.name AS user_name,
       (SELECT COUNT(*) FROM checklist_results x WHERE x.run_id = r.id AND x.done = 1) AS done_count
     FROM checklist_runs r JOIN users u ON u.id = r.user_id
     ${isDirector(req) ? '' : 'WHERE r.user_id = ?'}
     ORDER BY r.date DESC, r.id DESC LIMIT 60`, ...(isDirector(req) ? [] : [req.user.id]),
  );
  res.json(rows);
});

r.get('/checklist/runs/:id', (req, res) => {
  const row = get(`SELECT r.*, u.name AS user_name FROM checklist_runs r JOIN users u ON u.id = r.user_id WHERE r.id = ?`, req.params.id);
  if (!row) throw httpError(404, 'Чек-лист не найден');
  if (!isDirector(req) && row.user_id !== req.user.id) throw httpError(403, 'Нет доступа');
  res.json(runPayload(row));
});

// Отметить пункт (с фото)
r.post('/checklist/runs/:id/items/:itemId', upload.array('photos', 5), (req, res) => {
  const row = get('SELECT * FROM checklist_runs WHERE id = ?', req.params.id);
  if (!row || row.user_id !== req.user.id) throw httpError(403, 'Нет доступа');
  if (row.status === 'completed') throw httpError(400, 'Чек-лист уже завершён');
  const item = get('SELECT * FROM checklist_items WHERE id = ?', req.params.itemId);
  if (!item) throw httpError(404, 'Пункт не найден');
  const done = req.body.done === undefined ? 1 : bool(req.body.done);
  tx(() => {
    run(`INSERT INTO checklist_results (run_id, item_id, done, note) VALUES (?, ?, ?, ?)
         ON CONFLICT(run_id, item_id) DO UPDATE SET done = excluded.done, note = COALESCE(excluded.note, note)`,
      row.id, item.id, done, req.body.note || null);
    const res_ = get('SELECT id FROM checklist_results WHERE run_id = ? AND item_id = ?', row.id, item.id);
    savePhotos('checklist_item', res_.id, req.files, req.user.id);
  });
  res.json(runPayload(row));
});

r.post('/checklist/runs/:id/complete', (req, res) => {
  const row = get('SELECT * FROM checklist_runs WHERE id = ?', req.params.id);
  if (!row || row.user_id !== req.user.id) throw httpError(403, 'Нет доступа');
  if (row.status === 'completed') return res.json(runPayload(row));
  const p = runPayload(row);
  const missing = p.items.filter((i) => !i.done || (i.photo_required && !i.photos.length));
  if (missing.length) throw httpError(400, `Не выполнено: ${missing.map((m) => m.title).join(', ')}`);
  const pts = Number(getSetting('checklist_points', '0'));
  tx(() => {
    run(`UPDATE checklist_runs SET status = 'completed', completed_at = datetime('now'), comment = ? WHERE id = ?`, req.body?.comment || null, row.id);
    if (pts) run(`INSERT INTO points_ledger (user_id, delta, kind, reason, created_by) VALUES (?, ?, 'checklist', ?, ?)`,
      req.user.id, pts, `Чек-лист смены ${row.date}`, req.user.id);
  });
  notifyRole('director', `Чек-лист смены выполнен`, `${req.user.name} · ${row.date}`, `/checklist/${row.id}`);
  res.json(runPayload(get('SELECT * FROM checklist_runs WHERE id = ?', row.id)));
});

// ——— Шаблон (директор) ———
r.get('/checklist/items', (_req, res) => res.json(all('SELECT * FROM checklist_items WHERE active = 1 ORDER BY sort, id')));

r.post('/checklist/items', requireDirector, (req, res) => {
  required(req.body || {}, ['title']);
  const max = get('SELECT COALESCE(MAX(sort),0) AS m FROM checklist_items').m;
  run('INSERT INTO checklist_items (title, zone, photo_required, sort) VALUES (?, ?, ?, ?)',
    req.body.title.trim(), req.body.zone || null, bool(req.body.photo_required), max + 1);
  res.json({ ok: true });
});

r.patch('/checklist/items/:id', requireDirector, (req, res) => {
  const i = get('SELECT * FROM checklist_items WHERE id = ?', req.params.id);
  if (!i) throw httpError(404, 'Пункт не найден');
  const b = req.body || {};
  run('UPDATE checklist_items SET title = ?, zone = ?, photo_required = ?, sort = ? WHERE id = ?',
    b.title ?? i.title, b.zone ?? i.zone, b.photo_required === undefined ? i.photo_required : bool(b.photo_required), b.sort ?? i.sort, i.id);
  res.json({ ok: true });
});

r.delete('/checklist/items/:id', requireDirector, (req, res) => {
  run('UPDATE checklist_items SET active = 0 WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

export default r;
