import { Router } from 'express';
import { all, get, run, tx, getSetting, pointsBalance } from '../db.js';
import { requireAuth, requireDirector, isDirector } from '../auth.js';
import { notify, notifyRole, announce } from '../notify.js';
import { required, httpError, toCents, eur } from '../util.js';

const r = Router();
r.use(['/advances', '/points', '/exchanges'], requireAuth);

// ——— Авансы ———
r.get('/advances', (req, res) => {
  res.json(all(`SELECT a.*, u.name AS user_name, d.name AS decided_by_name FROM advances a
                JOIN users u ON u.id = a.user_id LEFT JOIN users d ON d.id = a.decided_by
                ${isDirector(req) ? '' : 'WHERE a.user_id = ?'}
                ORDER BY a.status != 'pending', a.id DESC LIMIT 200`, ...(isDirector(req) ? [] : [req.user.id])));
});

r.post('/advances', (req, res) => {
  required(req.body || {}, ['amount']);
  const amount = toCents(req.body.amount);
  if (amount <= 0) throw httpError(400, 'Сумма должна быть больше 0');
  const info = run('INSERT INTO advances (user_id, amount_cents, reason) VALUES (?, ?, ?)', req.user.id, amount, req.body.reason || null);
  notifyRole('director', `Запрос аванса: ${eur(amount)}`, `${req.user.name}${req.body.reason ? ` — ${req.body.reason}` : ''}`, '/money');
  announce('💸 Запрос аванса', req.body.reason || '', [{ name: 'Сотрудник', value: req.user.name }, { name: 'Сумма', value: eur(amount) }]);
  res.json({ id: Number(info.lastInsertRowid) });
});

r.post('/advances/:id/decide', requireDirector, (req, res) => {
  const a = get('SELECT * FROM advances WHERE id = ?', req.params.id);
  if (!a) throw httpError(404, 'Запрос не найден');
  const { decision, comment, envelope_id } = req.body || {};
  if (!['approved', 'rejected', 'paid'].includes(decision)) throw httpError(400, 'Некорректное решение');
  tx(() => {
    run(`UPDATE advances SET status = ?, decided_by = ?, decision_comment = ?, decided_at = datetime('now') WHERE id = ?`,
      decision, req.user.id, comment || null, a.id);
    // Выдача из конверта
    if (decision === 'paid' && envelope_id) {
      const u = get('SELECT name FROM users WHERE id = ?', a.user_id);
      run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, advance_id, created_by) VALUES (?, ?, ?, ?, ?)',
        envelope_id, -a.amount_cents, `Аванс: ${u.name}`, a.id, req.user.id);
    }
  });
  const label = { approved: '✅ Аванс одобрен', rejected: '❌ Аванс отклонён', paid: '💶 Аванс выдан' }[decision];
  notify(a.user_id, `${label}: ${eur(a.amount_cents)}`, comment || '', '/money');
  res.json({ ok: true });
});

// ——— Баллы ———
r.get('/points', (req, res) => {
  const uid = isDirector(req) && req.query.user_id ? Number(req.query.user_id) : req.user.id;
  const pending = get(`SELECT COALESCE(SUM(points),0) AS p FROM exchanges WHERE user_id = ? AND status = 'pending'`, uid).p;
  res.json({
    user_id: uid,
    balance: pointsBalance(uid),
    pending_exchange: pending,
    rate_cents: Number(getSetting('points_rate_cents', '10')),
    min_exchange: Number(getSetting('min_exchange_points', '100')),
    ledger: all(`SELECT l.*, c.name AS created_by_name FROM points_ledger l LEFT JOIN users c ON c.id = l.created_by
                 WHERE l.user_id = ? ORDER BY l.id DESC LIMIT 200`, uid),
  });
});

r.get('/points/leaderboard', (_req, res) => {
  res.json(all(`SELECT u.id, u.name, COALESCE(SUM(CASE WHEN l.delta > 0 AND l.kind != 'exchange' THEN l.delta END),0) AS earned_month,
                COALESCE(SUM(CASE WHEN l.kind = 'penalty' THEN l.delta END),0) AS penalties_month
                FROM users u LEFT JOIN points_ledger l ON l.user_id = u.id AND l.created_at >= date('now','start of month')
                WHERE u.active = 1 AND u.role = 'admin' GROUP BY u.id ORDER BY earned_month DESC`));
});

// Бонус или штраф (директор)
r.post('/points', requireDirector, (req, res) => {
  const b = req.body || {};
  required(b, ['user_id', 'points', 'reason']);
  const pts = Math.abs(parseInt(b.points, 10));
  if (!pts) throw httpError(400, 'Укажите количество баллов');
  const kind = b.kind === 'penalty' ? 'penalty' : 'bonus';
  const delta = kind === 'penalty' ? -pts : pts;
  run('INSERT INTO points_ledger (user_id, delta, kind, reason, created_by) VALUES (?, ?, ?, ?, ?)', b.user_id, delta, kind, b.reason, req.user.id);
  notify(b.user_id, kind === 'penalty' ? `⚠️ Штраф: −${pts} баллов` : `⭐ Бонус: +${pts} баллов`, b.reason, '/money');
  res.json({ ok: true });
});

// ——— Обмен баллов на деньги ———
r.get('/exchanges', (req, res) => {
  res.json(all(`SELECT x.*, u.name AS user_name FROM exchanges x JOIN users u ON u.id = x.user_id
                ${isDirector(req) ? '' : 'WHERE x.user_id = ?'} ORDER BY x.status != 'pending', x.id DESC LIMIT 200`,
    ...(isDirector(req) ? [] : [req.user.id])));
});

r.post('/exchanges', (req, res) => {
  const pts = parseInt(req.body?.points, 10);
  const min = Number(getSetting('min_exchange_points', '100'));
  const rate = Number(getSetting('points_rate_cents', '10'));
  if (!pts || pts < min) throw httpError(400, `Минимум для обмена — ${min} баллов`);
  const pending = get(`SELECT COALESCE(SUM(points),0) AS p FROM exchanges WHERE user_id = ? AND status = 'pending'`, req.user.id).p;
  if (pointsBalance(req.user.id) - pending < pts) throw httpError(400, 'Недостаточно баллов');
  run('INSERT INTO exchanges (user_id, points, amount_cents) VALUES (?, ?, ?)', req.user.id, pts, pts * rate);
  notifyRole('director', `Обмен баллов: ${pts} → ${eur(pts * rate)}`, req.user.name, '/money');
  res.json({ ok: true });
});

r.post('/exchanges/:id/decide', requireDirector, (req, res) => {
  const x = get('SELECT * FROM exchanges WHERE id = ?', req.params.id);
  if (!x || x.status !== 'pending') throw httpError(404, 'Запрос не найден или уже обработан');
  const approve = !!req.body?.approve;
  tx(() => {
    run(`UPDATE exchanges SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`, approve ? 'approved' : 'rejected', req.user.id, x.id);
    if (approve) {
      run(`INSERT INTO points_ledger (user_id, delta, kind, reason, created_by) VALUES (?, ?, 'exchange', ?, ?)`,
        x.user_id, -x.points, `Обмен на ${eur(x.amount_cents)}`, req.user.id);
      if (req.body.envelope_id) {
        const u = get('SELECT name FROM users WHERE id = ?', x.user_id);
        run('INSERT INTO envelope_tx (envelope_id, amount_cents, note, created_by) VALUES (?, ?, ?, ?)',
          req.body.envelope_id, -x.amount_cents, `Обмен баллов: ${u.name}`, req.user.id);
      }
    }
  });
  notify(x.user_id, approve ? `✅ Обмен баллов одобрен: ${eur(x.amount_cents)}` : '❌ Обмен баллов отклонён', '', '/money');
  res.json({ ok: true });
});

export default r;
