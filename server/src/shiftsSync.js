import { all, run, tx, setSetting } from './db.js';
import { config } from './config.js';

/**
 * Синхронизация смен из Google Таблицы.
 * Таблица публикуется как CSV («Файл → Поделиться → Опубликовать в интернете → CSV»),
 * ссылка кладётся в SHIFTS_CSV_URL.
 *
 * Ожидаемые колонки (порядок любой, регистр не важен):
 *   Дата | Сотрудник | Начало | Конец | Комментарий
 * Вместо «Начало/Конец» можно одну колонку «Время» со значением «10:00-22:00».
 */

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const HEAD = {
  date: ['дата', 'date', 'datums', 'день'],
  name: ['сотрудник', 'администратор', 'имя', 'employee', 'name', 'darbinieks', 'админ'],
  start: ['начало', 'start', 'с', 'sākums', 'from'],
  end: ['конец', 'end', 'до', 'beigas', 'to'],
  time: ['время', 'time', 'laiks', 'смена'],
  note: ['комментарий', 'comment', 'примечание', 'note', 'komentārs'],
};

function normDate(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}
const normTime = (s) => {
  const m = String(s || '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?/);
  return m ? `${m[1].padStart(2, '0')}:${m[2] || '00'}` : null;
};

export function parseShifts(csv) {
  const rows = parseCsv(csv);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [k, names] of Object.entries(HEAD)) col[k] = header.findIndex((h) => names.includes(h));
  if (col.date < 0 || col.name < 0) throw new Error('В таблице нет колонок «Дата» и «Сотрудник»');

  const out = [];
  for (const r of rows.slice(1)) {
    const date = normDate(r[col.date] || '');
    const name = (r[col.name] || '').trim();
    if (!date || !name) continue;
    let start = col.start >= 0 ? normTime(r[col.start]) : null;
    let end = col.end >= 0 ? normTime(r[col.end]) : null;
    if ((!start || !end) && col.time >= 0) {
      const [a, b] = String(r[col.time] || '').split(/[-–—]/);
      start ||= normTime(a); end ||= normTime(b);
    }
    // Несколько сотрудников в одной ячейке через запятую/слэш
    for (const n of name.split(/[,/;]+/).map((x) => x.trim()).filter(Boolean)) {
      out.push({ date, name: n, start: start || '00:00', end: end || '00:00', note: col.note >= 0 ? (r[col.note] || '').trim() : '' });
    }
  }
  return out;
}

export async function syncShifts() {
  if (!config.shiftsCsvUrl) throw new Error('SHIFTS_CSV_URL не настроен');
  const res = await fetch(config.shiftsCsvUrl, { signal: AbortSignal.timeout(15000), redirect: 'follow' });
  if (!res.ok) throw new Error(`Google Таблица вернула ${res.status}`);
  const shifts = parseShifts(await res.text());
  if (!shifts.length) return { imported: 0 };

  const users = all('SELECT id, name, sheet_name FROM users WHERE active = 1');
  const findUser = (n) => {
    const l = n.toLowerCase();
    return users.find((u) => (u.sheet_name || '').toLowerCase() === l || u.name.toLowerCase() === l)
      || users.find((u) => u.name.toLowerCase().split(' ')[0] === l);
  };
  const dates = shifts.map((s) => s.date).sort();
  const from = dates[0], to = dates[dates.length - 1];

  tx(() => {
    run(`DELETE FROM shifts WHERE source = 'sheet' AND date BETWEEN ? AND ?`, from, to);
    for (const s of shifts) {
      run(`INSERT OR REPLACE INTO shifts (user_id, employee_name, date, start_time, end_time, note, source) VALUES (?, ?, ?, ?, ?, ?, 'sheet')`,
        findUser(s.name)?.id ?? null, s.name, s.date, s.start, s.end, s.note || null);
    }
  });
  setSetting('shifts_last_sync', new Date().toISOString());
  return { imported: shifts.length, from, to };
}

export function startShiftsAutoSync() {
  if (!config.shiftsCsvUrl) return;
  const tick = () => syncShifts().then((r) => console.log('Смены синхронизированы:', r)).catch((e) => console.warn('Синхронизация смен:', e.message));
  tick();
  setInterval(tick, 15 * 60_000);
}
