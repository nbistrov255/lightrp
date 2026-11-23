import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requireAuth, requireDirector, isDirector } from '../auth.js';
import { upload, savePhotos, photosFor } from '../uploads.js';
import { notify, notifyRole, announce } from '../notify.js';
import { required, httpError, bool } from '../util.js';

const r = Router();
r.use('/tasks', requireAuth);

const PRIORITY_LABEL = { low: 'Низкий', normal: 'Обычный', high: 'Высокий', urgent: 'Срочно' };

const BASE = `
  SELECT t.*, a.name AS assignee_name, c.name AS creator_name
  FROM tasks t
  LEFT JOIN users a ON a.id = t.assignee_id
  LEFT JOIN users c ON c.id = t.created_by`;

function withPhotos(tasks) {
  const ph = photosFor('task', tasks.map((t) => t.id));
  return tasks.map((t) => ({ ...t, photos: ph[t.id] || [] }));
}

r.get('/tasks', (req, res) => {
  const { scope = 'active', mine } = req.query;
  const where = [];
  const p = [];
  if (scope === 'active') where.push(`t.status IN ('open','in_progress','rejected')`);
  if (scope === 'review') where.push(`t.status = 'review'`);
  if (scope === 'done') where.push(`t.status = 'done'`);
  // Администратор видит свои задачи и общие (без исполнителя)
  if (mine === '1' || !isDirector(req)) { where.push('(t.assignee_id = ? OR t.assignee_id IS NULL)'); p.push(req.user.id); }
  const sql = `${BASE} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
             t.deadline IS NULL, t.deadline, t.id DESC LIMIT 300`;
  res.json(withPhotos(all(sql, ...p)));
});

r.get('/tasks/:id', (req, res) => {
  const t = get(`${BASE} WHERE t.id = ?`, req.params.id);
  if (!t) throw httpError(404, 'Задача не найдена');
  res.json(withPhotos([t])[0]);
});

r.post('/tasks', requireDirector, (req, res) => {
  const b = req.body || {};
  required(b, ['title']);
  const info = run(
    `INSERT INTO tasks (title, description, zone, priority, deadline, assignee_id, created_by, points, photo_required)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    b.title.trim(), b.description || null, b.zone || null, PRIORITY_LABEL[b.priority] ? b.priority : 'normal',
    b.deadline || null, b.assignee_id || null, req.user.id, Number(b.points) || 0, bool(b.photo_required),
  );
  const id = Number(info.lastInsertRowid);
  const msg = `${PRIORITY_LABEL[b.priority] || 'Обычный'} приоритет${b.deadline ? ` · до ${b.deadline.replace('T', ' ')}` : ''}`;
  if (b.assignee_id) notify(b.assignee_id, `Новая задача: ${b.title}`, msg, `/tasks/${id}`);
  else notifyRole('admin', `Новая общая задача: ${b.title}`, msg, `/tasks/${id}`);
  if (b.priority === 'urgent') announce(`🔥 Срочная задача: ${b.title}`, b.description || '', [{ name: 'Зона', value: b.zone }], 0xff4d6d);
  res.json({ id });
});

r.patch('/tasks/:id', requireDirector, (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!t) throw httpError(404, 'Задача не найдена');
  const b = req.body || {};
  run(
    `UPDATE tasks SET title = ?, description = ?, zone = ?, priority = ?, deadline = ?, assignee_id = ?, points = ?, photo_required = ? WHERE id = ?`,
    b.title ?? t.title, b.description ?? t.description, b.zone ?? t.zone, b.priority ?? t.priority,
    b.deadline ?? t.deadline, b.assignee_id === undefined ? t.assignee_id : b.assignee_id || null,
    b.points ?? t.points, b.photo_required === undefined ? t.photo_required : bool(b.photo_required), t.id,
  );
  if (b.assignee_id && b.assignee_id !== t.assignee_id) notify(b.assignee_id, `Вам назначена задача: ${b.title ?? t.title}`, '', `/tasks/${t.id}`);
  res.json({ ok: true });
});

r.delete('/tasks/:id', requireDirector, (req, res) => {
  run(`DELETE FROM photos WHERE entity = 'task' AND entity_id = ?`, req.params.id);
  run('DELETE FROM tasks WHERE id = ?', req.params.id);
  res.json({ ok: true });
});

// Взять в работу
r.post('/tasks/:id/start', (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!t) throw httpError(404, 'Задача не найдена');
  if (t.assignee_id && t.assignee_id !== req.user.id && !isDirector(req)) throw httpError(403, 'Задача назначена другому сотруднику');
  run(`UPDATE tasks SET status = 'in_progress', assignee_id = COALESCE(assignee_id, ?) WHERE id = ?`, req.user.id, t.id);
  res.json({ ok: true });
});

// Сдать на проверку (с фото)
r.post('/tasks/:id/submit', upload.array('photos', 10), (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!t) throw httpError(404, 'Задача не найдена');
  if (t.assignee_id && t.assignee_id !== req.user.id && !isDirector(req)) throw httpError(403, 'Задача назначена другому сотруднику');
  const existing = get(`SELECT COUNT(*) AS n FROM photos WHERE entity = 'task' AND entity_id = ?`, t.id).n;
  if (t.photo_required && !existing && !req.files?.length) throw httpError(400, 'Для этой задачи нужно приложить фото');
  tx(() => {
    savePhotos('task', t.id, req.files, req.user.id);
    run(`UPDATE tasks SET status = 'review', report = ?, assignee_id = COALESCE(assignee_id, ?), completed_at = datetime('now') WHERE id = ?`,
      req.body.report || null, req.user.id, t.id);
  });
  notifyRole('director', `На проверку: ${t.title}`, `${req.user.name} выполнил(а) задачу`, `/tasks/${t.id}`);
  res.json({ ok: true });
});

// Проверка директором
r.post('/tasks/:id/review', requireDirector, (req, res) => {
  const t = get('SELECT * FROM tasks WHERE id = ?', req.params.id);
  if (!t) throw httpError(404, 'Задача не найдена');
  const { approve, comment, points } = req.body || {};
  if (approve) {
    const pts = points !== undefined && points !== '' ? Number(points) : t.points;
    tx(() => {
      run(`UPDATE tasks SET status = 'done', review_comment = ? WHERE id = ?`, comment || null, t.id);
      if (pts && t.assignee_id) {
        run(`INSERT INTO points_ledger (user_id, delta, kind, reason, task_id, created_by) VALUES (?, ?, 'task', ?, ?, ?)`,
          t.assignee_id, pts, `Задача: ${t.title}`, t.id, req.user.id);
      }
    });
    notify(t.assignee_id, `✅ Задача принята: ${t.title}`, pts ? `+${pts} баллов` : comment || '', `/tasks/${t.id}`);
  } else {
    run(`UPDATE tasks SET status = 'rejected', review_comment = ? WHERE id = ?`, comment || 'Нужно доработать', t.id);
    notify(t.assignee_id, `↩️ Задача возвращена: ${t.title}`, comment || 'Нужно доработать', `/tasks/${t.id}`);
  }
  res.json({ ok: true });
});

export default r;
