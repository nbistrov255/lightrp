import { useState } from 'react';
import { Star, Banknote, ArrowRightLeft, TrendingUp, TrendingDown, Trophy, Check, X, HandCoins } from 'lucide-react';
import { api, type Advance, type Envelope, type Exchange, type PointsInfo } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { ADVANCE_STATUS, LEDGER_KIND } from '../lib/meta';
import { eur, timeAgo } from '../lib/format';
import { Avatar, Badge, Button, Card, Empty, Field, Input, MoneyInput, PageHeader, SectionTitle, Segmented, Select, Sheet, Spinner, Textarea, cx, useAction } from '../components/ui';

type Tab = 'points' | 'advances' | 'approvals';

export default function Money() {
  const { isDirector } = useAuth();
  const [tab, setTab] = useState<Tab>(isDirector ? 'approvals' : 'points');
  return (
    <div>
      <PageHeader title="Баллы и авансы" subtitle="Награды за работу, штрафы, обмен на деньги и авансы" />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[
        ...(isDirector ? [{ value: 'approvals' as Tab, label: 'Согласования' }] : []),
        { value: 'points', label: isDirector ? 'Рейтинг' : 'Мои баллы' }, { value: 'advances', label: 'Авансы' },
      ]} />
      {tab === 'points' && (isDirector ? <Leaderboard /> : <MyPoints />)}
      {tab === 'advances' && <Advances />}
      {tab === 'approvals' && <Approvals />}
    </div>
  );
}

function MyPoints() {
  const { data, reload } = useApi<PointsInfo>('/points');
  const [ex, setEx] = useState(false);
  if (!data) return <Spinner />;
  const available = data.balance - data.pending_exchange;
  return (
    <div>
      <Card className="relative overflow-hidden bg-gradient-to-br from-accent/25 via-accent/10 to-accent-2/15 border-accent/30">
        <Star className="absolute -right-4 -top-4 size-32 text-accent/15" />
        <div className="text-sm font-semibold text-muted">Баланс баллов</div>
        <div className="text-5xl font-extrabold tracking-tight mt-1 tabular-nums">{data.balance}</div>
        <div className="text-sm text-muted mt-1">≈ {eur(data.balance * data.rate_cents)} · 1 балл = {eur(data.rate_cents)}</div>
        {data.pending_exchange > 0 && <div className="text-sm text-warn mt-1">{data.pending_exchange} баллов ждут обмена</div>}
        <Button className="mt-4" icon={<ArrowRightLeft className="size-4" />} disabled={available < data.min_exchange} onClick={() => setEx(true)}>Обменять на деньги</Button>
        {available < data.min_exchange && <div className="text-xs text-muted mt-2">Обмен доступен от {data.min_exchange} баллов</div>}
      </Card>
      <SectionTitle>История</SectionTitle>
      <Ledger rows={data.ledger} />
      {ex && <ExchangeSheet info={data} onClose={() => setEx(false)} onSaved={reload} />}
    </div>
  );
}

function Ledger({ rows }: { rows: PointsInfo['ledger'] }) {
  if (!rows.length) return <Empty icon={<Star />} title="Баллов пока нет" text="Выполняйте задачи и чек-листы, чтобы получать баллы" />;
  return (
    <Card className="p-1.5">
      {rows.map((l) => (
        <div key={l.id} className="flex items-center gap-3 p-2.5">
          <span className={cx('grid size-9 place-items-center rounded-2xl', l.delta > 0 ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad')}>
            {l.delta > 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{l.reason || LEDGER_KIND[l.kind]}</div>
            <div className="text-xs text-muted">{LEDGER_KIND[l.kind]} · {timeAgo(l.created_at)}</div>
          </div>
          <span className={cx('font-mono font-bold', l.delta > 0 ? 'text-ok' : 'text-bad')}>{l.delta > 0 ? '+' : ''}{l.delta}</span>
        </div>
      ))}
    </Card>
  );
}

function ExchangeSheet({ info, onClose, onSaved }: { info: PointsInfo; onClose: () => void; onSaved: () => void }) {
  const max = info.balance - info.pending_exchange;
  const [pts, setPts] = useState(String(max));
  const { busy, run } = useAction();
  const n = Math.min(Number(pts) || 0, max);
  return (
    <Sheet open onClose={onClose} title="Обмен баллов" footer={<Button block size="lg" loading={busy} disabled={n < info.min_exchange} onClick={() => run(async () => { await api.post('/exchanges', { points: n }); onSaved(); onClose(); }, 'Запрос отправлен директору')}>Запросить {eur(n * info.rate_cents)}</Button>}>
      <Field label={`Сколько баллов (доступно ${max})`}><Input type="number" inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value)} /></Field>
      <div className="text-center py-3"><div className="text-sm text-muted">Вы получите</div><div className="text-4xl font-extrabold text-gradient">{eur(n * info.rate_cents)}</div></div>
      <p className="text-xs text-muted text-center">Баллы спишутся после одобрения директором</p>
    </Sheet>
  );
}

function Leaderboard() {
  const { data, reload } = useApi<{ id: number; name: string; earned_month: number; penalties_month: number }[]>('/points/leaderboard');
  const { data: users } = useApi<{ id: number; name: string; points: number; role: string; active: number }[]>('/users');
  const [award, setAward] = useState<{ id: number; name: string } | null>(null);
  const [userLedger, setUserLedger] = useState<{ id: number; name: string } | null>(null);
  if (!data || !users) return <Spinner />;
  return (
    <div>
      <SectionTitle>Рейтинг месяца</SectionTitle>
      <Card className="p-1.5">
        {data.length === 0 && <div className="p-4 text-sm text-muted">Нет администраторов</div>}
        {data.map((u, i) => {
          const bal = users.find((x) => x.id === u.id)?.points ?? 0;
          return (
            <div key={u.id} className="flex items-center gap-3 p-2.5">
              <span className={cx('w-6 text-center font-extrabold', i === 0 ? 'text-warn' : 'text-muted')}>{i === 0 ? <Trophy className="size-5 inline" /> : i + 1}</span>
              <Avatar name={u.name} />
              <button className="flex-1 min-w-0 text-left" onClick={() => setUserLedger(u)}>
                <div className="font-semibold">{u.name}</div>
                <div className="text-xs text-muted">+{u.earned_month} за месяц{u.penalties_month ? <span className="text-bad"> · штрафы {u.penalties_month}</span> : ''} · баланс {bal}</div>
              </button>
              <Button size="sm" variant="secondary" onClick={() => setAward(u)}>± Баллы</Button>
            </div>
          );
        })}
      </Card>
      {award && <AwardSheet user={award} onClose={() => setAward(null)} onSaved={reload} />}
      {userLedger && <UserLedger user={userLedger} onClose={() => setUserLedger(null)} />}
    </div>
  );
}

function UserLedger({ user, onClose }: { user: { id: number; name: string }; onClose: () => void }) {
  const { data } = useApi<PointsInfo>(`/points?user_id=${user.id}`);
  return (
    <Sheet open onClose={onClose} title={`Баллы · ${user.name}`}>
      {!data ? <Spinner /> : <><div className="text-3xl font-extrabold">{data.balance} <span className="text-base text-muted font-semibold">баллов</span></div><Ledger rows={data.ledger} /></>}
    </Sheet>
  );
}

function AwardSheet({ user, onClose, onSaved }: { user: { id: number; name: string }; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'bonus' | 'penalty'>('bonus');
  const [points, setPoints] = useState('10');
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title={user.name} footer={
      <Button block size="lg" variant={kind === 'penalty' ? 'danger' : 'primary'} loading={busy} disabled={!reason.trim() || !Number(points)}
        onClick={() => run(async () => { await api.post('/points', { user_id: user.id, kind, points, reason }); onSaved(); onClose(); }, 'Сохранено')}>
        {kind === 'penalty' ? `Штраф −${points}` : `Начислить +${points}`}
      </Button>}>
      <Segmented value={kind} onChange={setKind} options={[{ value: 'bonus', label: '⭐ Бонус' }, { value: 'penalty', label: '⚠️ Штраф' }]} />
      <Field label="Баллы"><Input type="number" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
      <div className="flex flex-wrap gap-1.5">
        {(kind === 'bonus' ? ['Хороший отзыв клиента', 'Помощь вне смены', 'Идеальная чистота'] : ['Опоздание', 'Не сдан чек-лист', 'Беспорядок на смене']).map((r) => (
          <button key={r} onClick={() => setReason(r)} className="h-8 px-3 rounded-xl bg-surface-2 border border-line text-sm text-muted hover:text-text">{r}</button>
        ))}
      </div>
      <Field label="Причина"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Sheet>
  );
}

function Advances() {
  const { isDirector } = useAuth();
  const { data, reload } = useApi<Advance[]>('/advances');
  const [req, setReq] = useState(false);
  return (
    <div>
      {!isDirector && (
        <Card className="flex items-center gap-3 mb-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent/12 text-accent"><HandCoins className="size-5" /></span>
          <div className="flex-1"><div className="font-bold">Нужен аванс?</div><div className="text-sm text-muted">Запрос уйдёт директору на согласование</div></div>
          <Button onClick={() => setReq(true)}>Запросить</Button>
        </Card>
      )}
      {!data ? <Spinner /> : data.length === 0 ? <Empty icon={<Banknote />} title="Запросов авансов нет" /> : (
        <div className="space-y-2">{data.map((a) => <AdvanceRow key={a.id} a={a} showUser={isDirector} />)}</div>
      )}
      {req && <AdvanceSheet onClose={() => setReq(false)} onSaved={reload} />}
    </div>
  );
}

function AdvanceRow({ a, showUser, actions }: { a: Advance; showUser?: boolean; actions?: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-3">
        {showUser && <Avatar name={a.user_name} />}
        <div className="flex-1 min-w-0">
          <div className="font-bold text-lg tabular-nums">{eur(a.amount_cents)}</div>
          <div className="text-xs text-muted truncate">{showUser && `${a.user_name} · `}{a.reason || 'Без комментария'} · {timeAgo(a.created_at)}</div>
          {a.decision_comment && <div className="text-xs mt-1">💬 {a.decision_comment}</div>}
        </div>
        <Badge tone={ADVANCE_STATUS[a.status].tone}>{ADVANCE_STATUS[a.status].label}</Badge>
      </div>
      {actions && <div className="mt-3">{actions}</div>}
    </Card>
  );
}

function AdvanceSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title="Запрос аванса" footer={<Button block size="lg" loading={busy} disabled={!amount} onClick={() => run(async () => { await api.post('/advances', { amount, reason }); onSaved(); onClose(); }, 'Запрос отправлен')}>Отправить директору</Button>}>
      <Field label="Сумма"><MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      <Field label="Причина"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Необязательно" /></Field>
    </Sheet>
  );
}

function Approvals() {
  const { data: adv, reload: ra } = useApi<Advance[]>('/advances');
  const { data: ex, reload: re } = useApi<Exchange[]>('/exchanges');
  const { data: envs } = useApi<Envelope[]>('/envelopes');
  const [env, setEnv] = useState('');
  const { busy, run } = useAction();
  if (!adv || !ex) return <Spinner />;
  const pendingAdv = adv.filter((a) => a.status === 'pending' || a.status === 'approved');
  const pendingEx = ex.filter((x) => x.status === 'pending');
  const decide = (a: Advance, decision: string) => run(async () => { await api.post(`/advances/${a.id}/decide`, { decision, envelope_id: decision === 'paid' ? env || undefined : undefined }); ra(); }, 'Готово');

  return (
    <div>
      <Card className="mb-3 flex flex-col sm:flex-row sm:items-center gap-2">
        <span className="text-sm text-muted flex-1">Выдавать деньги из конверта (спишется автоматически):</span>
        <Select value={env} onChange={(e) => setEnv(e.target.value)} className="sm:w-60">
          <option value="">Не списывать</option>
          {envs?.map((e) => <option key={e.id} value={e.id}>{e.name} · {eur(e.balance_cents)}</option>)}
        </Select>
      </Card>
      <SectionTitle>Авансы</SectionTitle>
      {pendingAdv.length === 0 ? <Card className="text-sm text-muted">Нет запросов</Card> : (
        <div className="space-y-2">
          {pendingAdv.map((a) => (
            <AdvanceRow key={a.id} a={a} showUser actions={
              a.status === 'pending' ? (
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="danger" loading={busy} icon={<X className="size-4" />} onClick={() => decide(a, 'rejected')}>Отказ</Button>
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => decide(a, 'approved')}>Одобрить</Button>
                  <Button size="sm" variant="success" loading={busy} icon={<Check className="size-4" />} onClick={() => decide(a, 'paid')}>Выдать</Button>
                </div>
              ) : <Button size="sm" block variant="success" loading={busy} onClick={() => decide(a, 'paid')}>Отметить выданным</Button>
            } />
          ))}
        </div>
      )}
      <SectionTitle>Обмен баллов</SectionTitle>
      {pendingEx.length === 0 ? <Card className="text-sm text-muted">Нет запросов</Card> : (
        <div className="space-y-2">
          {pendingEx.map((x) => (
            <Card key={x.id} className="flex items-center gap-3">
              <Avatar name={x.user_name} />
              <div className="flex-1">
                <div className="font-bold">{x.points} баллов → {eur(x.amount_cents)}</div>
                <div className="text-xs text-muted">{x.user_name} · {timeAgo(x.created_at)}</div>
              </div>
              <Button size="sm" variant="danger" onClick={() => run(async () => { await api.post(`/exchanges/${x.id}/decide`, { approve: false }); re(); })}><X className="size-4" /></Button>
              <Button size="sm" variant="success" onClick={() => run(async () => { await api.post(`/exchanges/${x.id}/decide`, { approve: true, envelope_id: env || undefined }); re(); }, 'Обмен одобрен')}><Check className="size-4" /></Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
