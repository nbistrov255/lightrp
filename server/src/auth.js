import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { get } from './db.js';

const COOKIE = 'chc_session';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30 дней — на смене не нужно логиниться заново

export function issueSession(res, user) {
  const token = jwt.sign({ uid: user.id }, config.jwtSecret, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE,
  });
}

export function clearSession(res) {
  res.clearCookie(COOKIE);
}

export function publicUser(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE];
  if (!token) return res.status(401).json({ error: 'Требуется вход' });
  try {
    const { uid } = jwt.verify(token, config.jwtSecret);
    const user = get('SELECT * FROM users WHERE id = ? AND active = 1', uid);
    if (!user) return res.status(401).json({ error: 'Аккаунт не найден или отключён' });
    req.user = publicUser(user);
    next();
  } catch {
    return res.status(401).json({ error: 'Сессия истекла' });
  }
}

export function requireDirector(req, res, next) {
  if (req.user?.role !== 'director') return res.status(403).json({ error: 'Только для директора' });
  next();
}

export const isDirector = (req) => req.user?.role === 'director';
