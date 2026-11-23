import { all, run } from './db.js';
import { sendDiscord } from './discord.js';
import { config } from './config.js';

/** Уведомление конкретному пользователю (в приложении) */
export function notify(userId, title, body = '', link = '') {
  if (!userId) return;
  run('INSERT INTO notifications (user_id, title, body, link) VALUES (?, ?, ?, ?)', userId, title, body, link);
}

export function notifyRole(role, title, body = '', link = '', exceptId = null) {
  for (const u of all('SELECT id FROM users WHERE role = ? AND active = 1', role)) {
    if (u.id !== exceptId) notify(u.id, title, body, link);
  }
}

export function notifyAll(title, body = '', link = '', exceptId = null) {
  for (const u of all('SELECT id FROM users WHERE active = 1')) {
    if (u.id !== exceptId) notify(u.id, title, body, link);
  }
}

/** Важные события дублируются в общий Discord-канал */
export function announce(title, description, fields, color) {
  const url = config.publicUrl || undefined;
  sendDiscord('general', { title, description, fields, color, url }).catch(() => {});
}
