import { Router } from 'express';
import express from 'express';
import { all, get, run } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../config.js';
import { notifyAll } from '../notify.js';
import { sendDiscord } from '../discord.js';
import { httpError, required } from '../util.js';

const r = Router();

const SOURCE_LABEL = { tilda_ru: 'Сайт RU', tilda_lv: 'Сайт LV', manual: 'Вручную' };

// Поля форм Tilda называются так, как их назвали в конструкторе — ищем по набору синонимов (RU/LV/EN)
const FIELD_ALIASES = {
  name: ['name', 'имя', 'vārds', 'vards', 'fio', 'фио'],
  phone: ['phone', 'телефон', 'tālrunis', 'talrunis', 'tel', 'tālr'],
  email: ['email', 'e-mail', 'почта', 'e-pasts', 'epasts'],
  date: ['date', 'дата', 'datums'],
  time: ['time', 'время', 'laiks'],
  guests: ['guests', 'гости', 'количество', 'people', 'persons', 'cilvēki', 'cilveki', 'skaits', 'кол-во', 'pc', 'пк', 'места'],
  zone: ['zone', 'зона', 'zona', 'зал', 'zāle', 'zale', 'room', 'тип', 'pakete', 'пакет'],
  comment: ['comment', 'комментарий', 'komentārs', 'komentars', 'message', 'сообщение', 'ziņa', 'zina', 'textarea'],
};

export function mapTildaFields(body) {
  const out = {};
  const keys = Object.keys(body);
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const k = keys.find((key) => aliases.some((a) => key.toLowerCase().replace(/[_\s]+/g, '') === a.replace(/[_\s]+/g, '')))
      || keys.find((key) => aliases.some((a) => key.toLowerCase().includes(a)));
    if (k) out[field] = String(body[k]).trim();
  }
  return out;
}

/** Дата из формы Tilda («25.11.2026», «25/11/26», «2026-11-25») → единый вид ГГГГ-ММ-ДД, чтобы работали сортировка и «Сегодня/Завтра» */
export function normalizeBookingDate(v) {
  if (!v) return v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return s; // непонятный формат («в пятницу») сохраняем как есть
}

export function bookingDiscordPayload(b) {
  return {
    title: `📅 Новая бронь · ${SOURCE_LABEL[b.source] || b.source}`,
    description: b.comment || '',
    color: b.source === 'tilda_lv' ? 0x9e3039 : 0x7c5cff,
    fields: [
      { name: 'Имя', value: b.name }, { name: 'Телефон', value: b.phone }, { name: 'E-mail', value: b.email },
      { name: 'Дата', value: b.date }, { name: 'Время', value: b.time }, { name: 'Гостей / ПК', value: b.guests }, { name: 'Зона', value: b.zone },
    ],
  };
}

/**
 * Приём заявок Tilda.
 *  • напрямую от Tilda: POST /api/integrations/tilda?token=XXX&lang=ru  (form-urlencoded)
 *  • через ретранслятор (Google Apps Script): JSON { token, lang, discord_sent, data: {...} }
 */
r.post('/integrations/tilda', express.urlencoded({ extended: true, limit: '200kb' }), async (req, res) => {
  const body = req.body || {};
  // Tilda при подключении webhook шлёт test=test — просто отвечаем ok
  if (body.test === 'test') return res.send('ok');

  const token = req.query.token || body.token || req.get('x-cyberhub-token');
  if (!config.tildaToken || token !== config.tildaToken) return res.status(403).send('forbidden');

  const data = body.data && typeof body.data === 'object' ? body.data : body;
  const lang = String(req.query.lang || body.lang || '').toLowerCase() === 'lv' ? 'lv' : 'ru';
  const externalId = data.tranid || body.tranid || null;
  if (externalId && get('SELECT id FROM bookings WHERE external_id = ?', externalId)) return res.send('ok'); // дубль

  const clean = Object.fromEntries(Object.entries(data).filter(([k]) => !['token', 'formid', 'formname', 'tranid', 'COOKIES'].includes(k)));
  const f = mapTildaFields(clean);
  f.date = normalizeBookingDate(f.date);
  const relaySent = body.discord_sent === true || body.discord_sent === '1' || body.discord_sent === 1;
  const b = { source: `tilda_${lang}`, ...f };

  const info = run(
    `INSERT INTO bookings (external_id, source, name, phone, email, date, time, guests, zone, comment, raw, discord_sent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    externalId, b.source, f.name || null, f.phone || null, f.email || null, f.date || null, f.time || null,
    f.guests || null, f.zone || null, f.comment || null, JSON.stringify(clean), relaySent ? 1 : 0,
  );
  const id = Number(info.lastInsertRowid);
  res.send('ok');

  notifyAll(`📅 Новая бронь: ${f.name || 'без имени'}`, [f.date, f.time, f.guests && `${f.guests} чел.`].filter(Boolean).join(' · '), '/bookings');
  if (!relaySent) {
    const ok = await sendDiscord('bookings', bookingDiscordPayload(b));
    if (ok) run('UPDATE bookings SET discord_sent = 1 WHERE id = ?', id);
  }
});

r.use('/bookings', requireAuth);

r.get('/bookings', (req, res) => {
  const { status = 'active' } = req.query;
  const where = status === 'active' ? `WHERE b.status IN ('new','confirmed')` : status === 'all' ? '' : `WHERE b.status IN ('cancelled','done')`;
  res.json(all(`SELECT b.*, u.name AS handled_by_name FROM bookings b LEFT JOIN users u ON u.id = b.handled_by
                ${where} ORDER BY b.status != 'new', b.id DESC LIMIT 300`));
});

r.post('/bookings', (req, res) => {
  const b = req.body || {};
  required(b, ['name']);
  run(`INSERT INTO bookings (source, name, phone, date, time, guests, zone, comment, status, handled_by) VALUES ('manual', ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)`,
    b.name, b.phone || null, b.date || null, b.time || null, b.guests || null, b.zone || null, b.comment || null, req.user.id);
  res.json({ ok: true });
});

r.patch('/bookings/:id', (req, res) => {
  const b = get('SELECT * FROM bookings WHERE id = ?', req.params.id);
  if (!b) throw httpError(404, 'Бронь не найдена');
  const status = ['new', 'confirmed', 'cancelled', 'done'].includes(req.body?.status) ? req.body.status : b.status;
  run('UPDATE bookings SET status = ?, handled_by = ?, comment = COALESCE(?, comment) WHERE id = ?', status, req.user.id, req.body?.comment ?? null, b.id);
  res.json({ ok: true });
});

export default r;
