import { Router } from 'express';
import { all, get, run, tx } from '../db.js';
import { requireAuth, requireDirector, isDirector } from '../auth.js';
import { notify, notifyRole, announce } from '../notify.js';
import { required, httpError, toCents, today, eur } from '../util.js';

const r = Router();
r.use(['/cash', '/envelopes'], requireAuth);

const expected = (c) => c.cash_start_cents + c.cash_revenue_cents - c.expenses_cents - c.to_envelope_cents;

function decorate(c) {
  const exp = expected(c);
  return { ...c, expected_cash_cents: exp, difference_cents: c.cash_end_cents - exp };
}

r.get('/cash/reports', (req, res) => {
  const rows = all(
    `SELECT c.*, u.name AS user_name, e.name AS envelope_name FROM cash_reports c
     JOIN users u ON u.id = c.user_id LEFT JOIN envelopes e ON e.id = c.envelope_id
     ${isDirector(req) ? '' : 'WHERE c.user_id = ?'}
     ORDER BY c.date DESC, c.id DESC LIMIT 120`, ...(isDirector(req) ? [] : [req.user.id]),
  );
  res.json(rows.map(decorate));
});

// Подсказка: остаток на начало = фактический остаток из последнего отчёта
r.get('/cash/last', (_req, res) => {
  const last = get('SELECT cash_end_cents, date FROM cash_reports ORDER BY date DESC, id DESC LIMIT 1');
  res.json({ cash_start_cents: last?.cash_end_cents ?? 0, from_date: last?.date ?? null, date: today() });
});

r.post('/cash/reports', (req, res) => {
  const b = req.body || {};
  required(b, ['date']);
  const c = {
    cash_start_cents: toCents(b.cash_start), cash_revenue_cents: toCents(b.cash_revenue), card_revenue_cents: toCents(b.card_revenue),
    expenses_cents: toCents(b.expenses), cash_end_cents: toCents(b.cash_end), to_envelope_cents: toCents(b.to_envelope),
  };
  if (c.to_envelope_cents > 0 && !b.envelope_id) throw httpError(400, 'Выберите конверт для наличных');
  const id = tx(() => {
    const info = run(
      `INSERT INTO cash_reports (date, user_id, cash_start_cents, cash_revenue_cents, card_revenue_cents, expenses_cents, expenses_note,
        cash_end_cents, to_envelope_cents, envelope_id, comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.date, req.user.id, c.cash_start_cents, c.cash_revenue_cents, c.card_revenue_cents, c.expenses_cents, b.expenses_note || null,
      c.cash_end_cents, c.to_envelope_cents, b.envelope_id || null, b.comment || null,
    );
    const id = Number(info.lastInsertRowid);
    if (c.to_envelope_cents > 0) {
      run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, cash_report_id, created_by) VALUES (?, ?, ?, ?, ?)',
        b.envelope_id, c.to_envelope_cents, `Кассовый отчёт ${b.date}`, id, req.user.id);
    }
    return id;
  });
  const d = decorate({ ...c });
  const diff = d.difference_cents;
  notifyRole('director', `Кассовый отчёт ${b.date}`,
    `${req.user.name}: нал ${eur(c.cash_revenue_cents)}, карта ${eur(c.card_revenue_cents)}${diff ? ` · расхождение ${eur(diff)}` : ''}`, '/cash');
  announce(`💶 Кассовый отчёт ${b.date}`, diff ? `⚠️ Расхождение: ${eur(diff)}` : 'Касса сходится', [
    { name: 'Администратор', value: req.user.name },
    { name: 'Наличные', value: eur(c.cash_revenue_cents) }, { name: 'Карта', value: eur(c.card_revenue_cents) },
    { name: 'Расходы', value: c.expenses_cents ? eur(c.expenses_cents) : null },
  ], diff ? 0xffb020 : 0x22c55e);
  res.json({ id });
});

r.post('/cash/reports/:id/review', requireDirector, (req, res) => {
  const c = get('SELECT * FROM cash_reports WHERE id = ?', req.params.id);
  if (!c) throw httpError(404, 'Отчёт не найден');
  const status = req.body?.status === 'disputed' ? 'disputed' : 'approved';
  run('UPDATE cash_reports SET status = ?, director_comment = ? WHERE id = ?', status, req.body?.comment || null, c.id);
  notify(c.user_id, status === 'approved' ? `Кассовый отчёт ${c.date} принят` : `Вопрос по кассовому отчёту ${c.date}`, req.body?.comment || '', '/cash');
  res.json({ ok: true });
});

// ——— Конверты ———
r.get('/envelopes', (_req, res) => {
  res.json(all(`SELECT e.*, COALESCE((SELECT SUM(amount_cents) FROM envelope_tx t WHERE t.envelope_id = e.id),0) AS balance_cents
                FROM envelopes e WHERE e.active = 1 ORDER BY e.id`));
});

r.get('/envelopes/tx', (req, res) => {
  const p = [];
  let where = '';
  if (req.query.envelope_id) { where = 'WHERE t.envelope_id = ?'; p.push(req.query.envelope_id); }
  res.json(all(`SELECT t.*, e.name AS envelope_name, u.name AS user_name FROM envelope_tx t
                JOIN envelopes e ON e.id = t.envelope_id LEFT JOIN users u ON u.id = t.created_by
                ${where} ORDER BY t.id DESC LIMIT 200`, ...p));
});

r.post('/envelopes', requireDirector, (req, res) => {
  required(req.body || {}, ['name']);
  run('INSERT INTO envelopes (name, color) VALUES (?, ?)', req.body.name.trim(), req.body.color || null);
  res.json({ ok: true });
});

// Движение по конверту: директор — любое, администратор — только с комментарием (сообщается директору)
r.post('/envelopes/:id/tx', (req, res) => {
  const e = get('SELECT * FROM envelopes WHERE id = ?', req.params.id);
  if (!e) throw httpError(404, 'Конверт не найден');
  required(req.body || {}, ['amount', 'note']);
  const amount = toCents(req.body.amount);
  if (!amount) throw httpError(400, 'Сумма не может быть 0');
  if (req.body.to_envelope_id) {
    // Перекладывание между конвертами
    tx(() => {
      run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)', e.id, -Math.abs(amount), `→ ${req.body.note}`, req.user.id);
      run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)', req.body.to_envelope_id, Math.abs(amount), `← ${req.body.note}`, req.user.id);
    });
  } else {
    run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)', e.id, amount, req.body.note, req.user.id);
  }
  if (!isDirector(req)) notifyRole('director', `Конверт «${e.name}»: ${eur(amount)}`, `${req.user.name}: ${req.body.note}`, '/cash');
  res.json({ ok: true });
});

export default r;
