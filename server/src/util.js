import { config } from './config.js';

/** Сегодняшняя дата в Риге в формате YYYY-MM-DD */
export function today() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
}

/** «12,50» / «12.5» / 12.5 → 1250 */
export function toCents(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(',', '.').replace(/\s/g, ''));
  if (!Number.isFinite(n)) throw httpError(400, 'Некорректная сумма');
  return Math.round(n * 100);
}

export const eur = (cents) => (cents / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'EUR' });

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

export function required(body, fields) {
  for (const f of fields) {
    if (body[f] === undefined || body[f] === null || String(body[f]).trim() === '') {
      throw httpError(400, `Поле «${f}» обязательно`);
    }
  }
}

export const bool = (v) => (v === true || v === 1 || v === '1' || v === 'true' || v === 'on' ? 1 : 0);

/** Текущее время в Риге в формате YYYY-MM-DDTHH:MM (как <input type="datetime-local">) */
export function nowLocal() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: config.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .format(new Date()).replace(' ', 'T');
}
