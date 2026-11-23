import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requireAuth } from '../auth.js';
import { upload, savePhotos, photosFor } from '../uploads.js';
import { notifyAll, announce } from '../notify.js';
import { required, httpError } from '../util.js';

const r = Router();
r.use('/breakdowns', requireAuth);

const SEV = { low: 'Незначительная', medium: 'Средняя', critical: 'Критическая' };

r.get('/breakdowns', (req, res) => {
  const { status = 'open' } = req.query;
  const where = status === 'open' ? `WHERE b.status != 'fixed'` : status === 'fixed' ? `WHERE b.status = 'fixed'` : '';
  const rows = all(
    `SELECT b.*, u.name AS reporter_name, s.name AS resolver_name FROM breakdowns b
     LEFT JOIN users u ON u.id = b.reported_by LEFT JOIN users s ON s.id = b.resolved_by
     ${where}
     ORDER BY b.status = 'fixed', CASE b.severity WHEN 'critical' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, b.id DESC LIMIT 300`,
  );
  const ph = photosFor('breakdown', rows.map((x) => x.id));
  res.json(rows.map((x) => ({ ...x, photos: ph[x.id] || [] })));
});

r.post('/breakdowns', upload.array('photos', 6), (req, res) => {
  const b = req.body || {};
  required(b, ['title']);
  const id = tx(() => {
    const info = run(`INSERT INTO breakdowns (title, equipment, zone, description, severity, reported_by) VALUES (?, ?, ?, ?, ?, ?)`,
      b.title.trim(), b.equipment || null, b.zone || null, b.description || null, SEV[b.severity] ? b.severity : 'medium', req.user.id);
    const id = Number(info.lastInsertRowid);
    savePhotos('breakdown', id, req.files, req.user.id);
    return id;
  });
  const title = `${b.severity === 'critical' ? '🚨' : '🛠'} Поломка: ${b.title}${b.equipment ? ` (${b.equipment})` : ''}`;
  notifyAll(title, `${SEV[b.severity] || 'Средняя'} · ${req.user.name}`, `/breakdowns`, req.user.id);
  announce(title, b.description || '', [
    { name: 'Зона', value: b.zone }, { name: 'Важность', value: SEV[b.severity] || 'Средняя' }, { name: 'Сообщил', value: req.user.name },
  ], b.severity === 'critical' ? 0xff4d6d : 0xffb020);
  res.json({ id });
});

r.patch('/breakdowns/:id', upload.array('photos', 6), (req, res) => {
  const x = get('SELECT * FROM breakdowns WHERE id = ?', req.params.id);
  if (!x) throw httpError(404, 'Запись не найдена');
  const b = req.body || {};
  const status = ['new', 'in_progress', 'fixed'].includes(b.status) ? b.status : x.status;
  tx(() => {
    run(`UPDATE breakdowns SET status = ?, resolution = COALESCE(?, resolution), severity = COALESCE(?, severity),
         resolved_by = CASE WHEN ? = 'fixed' THEN ? ELSE resolved_by END,
         resolved_at = CASE WHEN ? = 'fixed' AND resolved_at IS NULL THEN datetime('now') ELSE resolved_at END
         WHERE id = ?`,
      status, b.resolution || null, SEV[b.severity] ? b.severity : null, status, req.user.id, status, x.id);
    savePhotos('breakdown', x.id, req.files, req.user.id);
  });
  if (status === 'fixed' && x.status !== 'fixed') {
    announce(`✅ Исправлено: ${x.title}${x.equipment ? ` (${x.equipment})` : ''}`, b.resolution || '', [{ name: 'Кто', value: req.user.name }], 0x22c55e);
  }
  res.json({ ok: true });
});

export default r;
