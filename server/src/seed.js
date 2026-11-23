/**
 * Первичная настройка: аккаунт директора, базовый чек-лист и конверты.
 *   npm run seed                         — директор director / cyberhub (смените пароль!)
 *   npm run seed -- --demo               — плюс демо-данные для просмотра интерфейса
 */
import bcrypt from 'bcryptjs';
import { get, run, all } from './db.js';
import { today } from './util.js';

const demo = process.argv.includes('--demo');
const hash = (p) => bcrypt.hashSync(p, 10);

if (!get(`SELECT 1 FROM users WHERE role = 'director'`)) {
  run(`INSERT INTO users (name, login, password_hash, role, sheet_name) VALUES ('Директор', 'director', ?, 'director', 'Директор')`, hash('cyberhub'));
  console.log('Создан директор: логин director, пароль cyberhub — смените пароль после входа!');
}

if (!get('SELECT 1 FROM checklist_items')) {
  const items = [
    ['Включить все ПК и проверить вход в лаунчер', 'Общий зал', 0],
    ['Проверить VIP-зону: чистота, периферия на местах', 'VIP', 1],
    ['Протереть столы, клавиатуры и мыши', 'Общий зал', 1],
    ['Проверить консоли и геймпады (заряд)', 'Консоли', 0],
    ['Пересчитать кассу на начало смены', 'Ресепшен', 1],
    ['Проверить холодильник и остатки напитков', 'Бар', 1],
    ['Проверить туалет: чистота, бумага, мыло', 'Туалет', 0],
    ['Включить музыку и свет в зале', 'Общий зал', 0],
  ];
  items.forEach(([t, z, p], i) => run('INSERT INTO checklist_items (title, zone, photo_required, sort) VALUES (?, ?, ?, ?)', t, z, p, i));
}

if (!get('SELECT 1 FROM envelopes')) {
  for (const [n, c] of [['Сейф', '#7c5cff'], ['Инкассация', '#22c55e'], ['Зарплаты и авансы', '#f59e0b'], ['Хозрасходы', '#06b6d4']]) {
    run('INSERT INTO envelopes (name, color) VALUES (?, ?)', n, c);
  }
}

if (demo && !get(`SELECT 1 FROM users WHERE login = 'anna'`)) {
  const d = today();
  const dir = get(`SELECT id FROM users WHERE role = 'director'`).id;
  const add = (name, login) => Number(run(`INSERT INTO users (name, login, password_hash, sheet_name) VALUES (?, ?, ?, ?)`, name, login, hash('admin123'), name).lastInsertRowid);
  const anna = add('Анна', 'anna'), mark = add('Марк', 'mark'), liga = add('Līga', 'liga');
  const day = (n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  for (let i = -1; i < 7; i++) {
    const [a, b] = i % 3 === 0 ? [anna, mark] : i % 3 === 1 ? [mark, liga] : [liga, anna];
    const na = all('SELECT name FROM users WHERE id = ?', a)[0].name, nb = all('SELECT name FROM users WHERE id = ?', b)[0].name;
    run(`INSERT OR IGNORE INTO shifts (user_id, employee_name, date, start_time, end_time) VALUES (?, ?, ?, '10:00', '18:00')`, a, na, day(i));
    run(`INSERT OR IGNORE INTO shifts (user_id, employee_name, date, start_time, end_time) VALUES (?, ?, ?, '18:00', '02:00')`, b, nb, day(i));
  }
  const t = (title, zone, priority, assignee, points, deadline, status = 'open', photo = 1) =>
    run(`INSERT INTO tasks (title, zone, priority, assignee_id, created_by, points, deadline, status, photo_required, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, zone, priority, assignee, dir, points, deadline, status, photo, 'Сделать аккуратно и приложить фото результата.');
  t('Заменить коврик на ПК-07', 'Общий зал', 'high', anna, 15, `${d}T20:00`);
  t('Разобрать поставку напитков', 'Склад', 'normal', null, 10, `${day(1)}T14:00`);
  t('Почистить кулеры в VIP-зоне', 'VIP', 'urgent', mark, 30, `${d}T16:00`, 'in_progress');
  t('Обновить ценники на баре', 'Бар', 'low', liga, 5, null, 'review');
  run(`INSERT INTO breakdowns (title, equipment, zone, severity, description, reported_by) VALUES ('Не работает правая кнопка мыши', 'ПК-12', 'Общий зал', 'medium', 'Кликает через раз', ?)`, anna);
  run(`INSERT INTO breakdowns (title, equipment, zone, severity, description, reported_by) VALUES ('Монитор не включается', 'VIP-3', 'VIP', 'critical', 'Нет изображения, индикатор мигает', ?)`, mark);
  run(`INSERT INTO bookings (source, name, phone, date, time, guests, zone, comment) VALUES ('tilda_ru', 'Даниил', '+371 2000 0000', ?, '19:00', '5', 'Bootcamp', 'День рождения, нужен один стол рядом')`, day(1));
  run(`INSERT INTO bookings (source, name, phone, date, time, guests, zone) VALUES ('tilda_lv', 'Jānis', '+371 2111 1111', ?, '21:00', '2', 'VIP')`, d);
  for (const [u, p, r] of [[anna, 40, 'Задача: генеральная уборка'], [mark, 25, 'Бонус за отзыв клиента'], [liga, -10, 'Опоздание на смену']]) {
    run(`INSERT INTO points_ledger (user_id, delta, kind, reason, created_by) VALUES (?, ?, ?, ?, ?)`, u, p, p > 0 ? 'bonus' : 'penalty', r, dir);
  }
  run(`INSERT INTO advances (user_id, amount_cents, reason) VALUES (?, 5000, 'Оплата проездного')`, mark);
  run(`INSERT INTO envelope_tx (envelope_id, amount_cents, note, created_by) VALUES (1, 35000, 'Начальный остаток', ?)`, dir);
  console.log('Демо-данные добавлены. Администраторы: anna / mark / liga, пароль admin123');
}
console.log('Готово.');
