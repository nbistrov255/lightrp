import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

export const db = new DatabaseSync(config.dbFile);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('director','admin')),
  phone TEXT,
  discord_id TEXT,
  sheet_name TEXT,               -- как сотрудник записан в Google Таблице смен
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  date TEXT NOT NULL,            -- YYYY-MM-DD
  start_time TEXT NOT NULL,      -- HH:MM
  end_time TEXT NOT NULL,
  note TEXT,
  source TEXT NOT NULL DEFAULT 'sheet',
  UNIQUE (date, start_time, employee_name)
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  zone TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  deadline TEXT,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','review','done','rejected')),
  points INTEGER NOT NULL DEFAULT 0,
  photo_required INTEGER NOT NULL DEFAULT 0,
  report TEXT,
  review_comment TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  entity TEXT NOT NULL,          -- task | checklist_item | breakdown
  entity_id INTEGER NOT NULL,
  file TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS photos_entity ON photos(entity, entity_id);

CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  zone TEXT,
  photo_required INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS checklist_runs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed')),
  comment TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS checklist_results (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES checklist_runs(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES checklist_items(id),
  done INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  UNIQUE (run_id, item_id)
);

CREATE TABLE IF NOT EXISTS breakdowns (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  equipment TEXT,                -- например «ПК-12», «PS5 #2»
  zone TEXT,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','critical')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','fixed')),
  reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  resolution TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS envelopes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS envelope_tx (
  id INTEGER PRIMARY KEY,
  envelope_id INTEGER NOT NULL REFERENCES envelopes(id),
  amount_cents INTEGER NOT NULL,  -- + приход, − расход
  note TEXT,
  cash_report_id INTEGER REFERENCES cash_reports(id) ON DELETE SET NULL,
  advance_id INTEGER REFERENCES advances(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cash_reports (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  cash_start_cents INTEGER NOT NULL DEFAULT 0,
  cash_revenue_cents INTEGER NOT NULL DEFAULT 0,
  card_revenue_cents INTEGER NOT NULL DEFAULT 0,
  expenses_cents INTEGER NOT NULL DEFAULT 0,
  expenses_note TEXT,
  cash_end_cents INTEGER NOT NULL DEFAULT 0,      -- фактически в кассе
  to_envelope_cents INTEGER NOT NULL DEFAULT 0,   -- сколько убрано в конверт
  envelope_id INTEGER REFERENCES envelopes(id),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','disputed')),
  director_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS advances (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount_cents INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','paid')),
  decided_by INTEGER REFERENCES users(id),
  decision_comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('task','bonus','penalty','exchange','checklist')),
  reason TEXT,
  task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS exchanges (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  decided_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY,
  external_id TEXT UNIQUE,       -- tranid Tilda — защита от дублей
  source TEXT NOT NULL,          -- tilda_ru | tilda_lv | manual
  name TEXT,
  phone TEXT,
  email TEXT,
  date TEXT,
  time TEXT,
  guests TEXT,
  zone TEXT,
  comment TEXT,
  raw TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','cancelled','done')),
  handled_by INTEGER REFERENCES users(id),
  discord_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notif_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('points_rate_cents', '10'),           -- 1 балл = 0,10 €
  ('min_exchange_points', '100'),
  ('checklist_points', '5'),
  ('zones', '["Общий зал","VIP","Bootcamp","Консоли","Бар","Ресепшен","Склад","Туалет"]'),
  ('shifts_last_sync', '');
`);

// Небольшие помощники поверх node:sqlite
export const all = (sql, ...p) => db.prepare(sql).all(...p);
export const get = (sql, ...p) => db.prepare(sql).get(...p);
export const run = (sql, ...p) => db.prepare(sql).run(...p);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function getSetting(key, fallback = null) {
  const r = get('SELECT value FROM settings WHERE key = ?', key);
  return r ? r.value : fallback;
}
export function setSetting(key, value) {
  run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, String(value));
}

export function pointsBalance(userId) {
  return get('SELECT COALESCE(SUM(delta),0) AS b FROM points_ledger WHERE user_id = ?', userId).b;
}
