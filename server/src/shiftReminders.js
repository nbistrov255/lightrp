import { all, get, run } from './db.js';
import { notify } from './notify.js';
import { today, nowLocal } from './util.js';

/**
 * Напоминание в начале смены.
 * Брони приходят и ночью, и утром до открытия — администратор, который заступает на смену,
 * должен сразу увидеть всё, на что ещё никто не ответил, даже если пропустил исходное уведомление.
 * Срабатывает один раз на смену (ключ в reminders_sent), проверка раз в минуту.
 */
export function shiftStartTick() {
  const d = today();
  const now = nowLocal().slice(11, 16);
  const started = all(
    `SELECT * FROM shifts WHERE date = ? AND user_id IS NOT NULL AND start_time <= ?
       AND (end_time > ? OR end_time <= start_time)`, // ещё идёт (в т. ч. ночная смена до утра)
    d, now, now,
  );
  for (const s of started) {
    const key = `shift-start:${s.user_id}:${s.date}:${s.start_time}`;
    if (run('INSERT OR IGNORE INTO reminders_sent (key) VALUES (?)', key).changes === 0) continue;

    const fresh = all(`SELECT name, date, time FROM bookings WHERE status = 'new' ORDER BY id`);
    if (fresh.length) {
      const list = fresh.slice(0, 5).map((b) => [b.name || 'без имени', b.date, b.time].filter(Boolean).join(', ')).join('; ');
      notify(s.user_id, `📅 Новые брони ждут ответа: ${fresh.length}`,
        `${list}${fresh.length > 5 ? ` и ещё ${fresh.length - 5}` : ''}`, '/bookings');
    }
    const tasks = get(`SELECT COUNT(*) AS n FROM tasks WHERE status IN ('open','rejected') AND (assignee_id = ? OR assignee_id IS NULL)`, s.user_id).n;
    if (tasks) notify(s.user_id, `Смена началась: задач на вас — ${tasks}`, 'Не забудьте чек-лист начала смены', '/');
  }
}

export function startShiftReminders() {
  const tick = () => { try { shiftStartTick(); } catch (e) { console.warn('Напоминания смены:', e.message); } };
  tick();
  setInterval(tick, 60_000);
}
