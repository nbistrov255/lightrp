const TZ = 'Europe/Riga';

export const eur = (cents: number) =>
  (cents / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'EUR', minimumFractionDigits: cents % 100 ? 2 : 0 });

export const centsToInput = (c: number) => (c / 100).toFixed(2).replace(/\.00$/, '');
export const parseMoney = (v: string) => Math.round(Number(String(v || '0').replace(',', '.').replace(/\s/g, '')) * 100) || 0;

export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** SQLite datetime('now') хранится в UTC без «Z» */
const parse = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) || s.includes('T') ? s : s.replace(' ', 'T') + 'Z');

export function dayLabel(iso: string) {
  const t = todayISO();
  if (iso === t) return 'Сегодня';
  if (iso === addDays(t, 1)) return 'Завтра';
  if (iso === addDays(t, -1)) return 'Вчера';
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function dateShort(iso?: string | null) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return dayLabel(iso);
  return iso;
}

export function deadlineLabel(dl?: string) {
  if (!dl) return '';
  const [d, t] = dl.split('T');
  return `${dayLabel(d)}${t ? `, ${t}` : ''}`;
}

export function isOverdue(dl?: string) {
  if (!dl) return false;
  const now = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date()).replace(' ', 'T');
  return dl.length === 10 ? dl < now.slice(0, 10) : dl < now;
}

export function timeAgo(s: string) {
  const diff = (Date.now() - parse(s).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  return parse(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export function dateTime(s: string) {
  return parse(s).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ });
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export const initials = (name = '') => name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();
