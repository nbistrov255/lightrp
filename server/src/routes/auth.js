import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { get, all, run, pointsBalance } from '../db.js';
import { issueSession, clearSession, publicUser, requireAuth, requireDirector } from '../auth.js';
import { required, httpError } from '../util.js';

const r = Router();

// Простая защита от перебора паролей
const attempts = new Map();
r.post('/auth/login', (req, res) => {
  const key = req.ip;
  const a = attempts.get(key) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 15 * 60_000) { a.n = 0; a.t = Date.now(); }
  if (a.n >= 10) return res.status(429).json({ error: 'Слишком много попыток. Подождите 15 минут.' });

  const { login, password } = req.body || {};
  const user = login && get('SELECT * FROM users WHERE login = ? AND active = 1', String(login).trim());
  if (!user || !bcrypt.compareSync(String(password || ''), user.password_hash)) {
    a.n++; attempts.set(key, a);
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  attempts.delete(key);
  issueSession(res, user);
  res.json({ user: publicUser(user) });
});

r.post('/auth/logout', (_req, res) => { clearSession(res); res.json({ ok: true }); });

r.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: { ...req.user, points: pointsBalance(req.user.id) } });
});

r.post('/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const u = get('SELECT * FROM users WHERE id = ?', req.user.id);
  if (!bcrypt.compareSync(String(current || ''), u.password_hash)) throw httpError(400, 'Текущий пароль неверен');
  if (!next || String(next).length < 6) throw httpError(400, 'Новый пароль — минимум 6 символов');
  run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(next), 10), u.id);
  res.json({ ok: true });
});

// ——— Сотрудники ———
r.get('/users', requireAuth, (req, res) => {
  const users = all('SELECT id, name, login, role, phone, discord_id, sheet_name, active, created_at FROM users ORDER BY active DESC, role, name');
  res.json(users.map((u) => ({ ...u, points: pointsBalance(u.id) })));
});

r.post('/users', requireAuth, requireDirector, (req, res) => {
  const b = req.body || {};
  required(b, ['name', 'login', 'password']);
  if (String(b.password).length < 6) throw httpError(400, 'Пароль — минимум 6 символов');
  if (get('SELECT 1 FROM users WHERE login = ?', b.login)) throw httpError(409, 'Такой логин уже занят');
  const info = run(
    'INSERT INTO users (name, login, password_hash, role, phone, discord_id, sheet_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
    b.name.trim(), b.login.trim(), bcrypt.hashSync(String(b.password), 10),
    b.role === 'director' ? 'director' : 'admin', b.phone || null, b.discord_id || null, b.sheet_name || b.name.trim(),
  );
  res.json({ id: Number(info.lastInsertRowid) });
});

r.patch('/users/:id', requireAuth, requireDirector, (req, res) => {
  const b = req.body || {};
  const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
  if (!u) throw httpError(404, 'Сотрудник не найден');
  if (u.id === req.user.id && (b.active === 0 || b.role === 'admin')) throw httpError(400, 'Нельзя отключить или понизить себя');
  run(
    'UPDATE users SET name = ?, role = ?, phone = ?, discord_id = ?, sheet_name = ?, active = ? WHERE id = ?',
    b.name ?? u.name, b.role ?? u.role, b.phone ?? u.phone, b.discord_id ?? u.discord_id,
    b.sheet_name ?? u.sheet_name, b.active ?? u.active, u.id,
  );
  if (b.password) {
    if (String(b.password).length < 6) throw httpError(400, 'Пароль — минимум 6 символов');
    run('UPDATE users SET password_hash = ? WHERE id = ?', bcrypt.hashSync(String(b.password), 10), u.id);
  }
  res.json({ ok: true });
});

export default r;
