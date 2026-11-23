import { useEffect, useState } from 'react';
import { Mail, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Plus, Check, AlertTriangle, Receipt, CreditCard, Banknote } from 'lucide-react';
import { api, type CashReport, type Envelope, type EnvelopeTx } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { centsToInput, dayLabel, eur, parseMoney, timeAgo, todayISO } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, MoneyInput, PageHeader, SectionTitle, Segmented, Select, Sheet, Spinner, Textarea, cx, useAction } from '../components/ui';

type Tab = 'report' | 'envelopes' | 'history';

export default function Cash() {
  const { isDirector } = useAuth();
  const [tab, setTab] = useState<Tab>(isDirector ? 'history' : 'report');
  return (
    <div>
      <PageHeader title="Касса" subtitle="Ежедневные отчёты и наличные по конвертам" />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[
        { value: 'report', label: 'Отчёт смены' }, { value: 'envelopes', label: 'Конверты' }, { value: 'history', label: 'История' },
      ]} />
      {tab === 'report' && <ReportForm onDone={() => setTab('history')} />}
      {tab === 'envelopes' && <Envelopes />}
      {tab === 'history' && <History />}
    </div>
  );
}

function ReportForm({ onDone }: { onDone: () => void }) {
  const { data: envs } = useApi<Envelope[]>('/envelopes');
  const { data: last } = useApi<{ cash_start_cents: number; from_date: string | null }>('/cash/last');
  const [f, setF] = useState({ date: todayISO(), cash_start: '', cash_revenue: '', card_revenue: '', expenses: '', expenses_note: '', to_envelope: '', envelope_id: '', cash_end: '', comment: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { busy, run } = useAction();

  useEffect(() => { if (last && f.cash_start === '') setF((x) => ({ ...x, cash_start: centsToInput(last.cash_start_cents) })); }, [last]); // eslint-disable-line
  useEffect(() => { if (envs?.length && !f.envelope_id) setF((x) => ({ ...x, envelope_id: String(envs[0].id) })); }, [envs]); // eslint-disable-line

  const expected = parseMoney(f.cash_start) + parseMoney(f.cash_revenue) - parseMoney(f.expenses) - parseMoney(f.to_envelope);
  const diff = f.cash_end === '' ? null : parseMoney(f.cash_end) - expected;
  const total = parseMoney(f.cash_revenue) + parseMoney(f.card_revenue);

  const submit = () => run(async () => { await api.post('/cash/reports', f); onDone(); }, 'Отчёт отправлен директору');

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4 items-start">
      <div className="space-y-3">
        <Card className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Дата"><Input type="date" value={f.date} onChange={set('date')} /></Field>
            <Field label="Касса на начало" hint={last?.from_date ? `из отчёта за ${dayLabel(last.from_date).toLowerCase()}` : undefined}><MoneyInput value={f.cash_start} onChange={set('cash_start')} /></Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <div className="flex items-center gap-2 font-bold"><Receipt className="size-5 text-accent" />Выручка за смену</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="inline-flex items-center gap-1"><Banknote className="size-3.5" />Наличные</span>}><MoneyInput value={f.cash_revenue} onChange={set('cash_revenue')} /></Field>
            <Field label={<span className="inline-flex items-center gap-1"><CreditCard className="size-3.5" />Карта</span>}><MoneyInput value={f.card_revenue} onChange={set('card_revenue')} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Расходы из кассы"><MoneyInput value={f.expenses} onChange={set('expenses')} /></Field>
            <Field label="На что"><Input value={f.expenses_note} onChange={set('expenses_note')} placeholder="Вода, моющее…" /></Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <div className="flex items-center gap-2 font-bold"><Mail className="size-5 text-accent-2" />Наличные в конверт</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Сумма"><MoneyInput value={f.to_envelope} onChange={set('to_envelope')} /></Field>
            <Field label="Конверт">
              <Select value={f.envelope_id} onChange={set('envelope_id')}>{envs?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select>
            </Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <Field label="Фактически в кассе на конец смены" hint="Пересчитайте наличные после выемки в конверт"><MoneyInput value={f.cash_end} onChange={set('cash_end')} /></Field>
          <Field label="Комментарий"><Textarea value={f.comment} onChange={set('comment')} placeholder="Если есть расхождение — объясните" /></Field>
        </Card>
      </div>

      <Card className="lg:sticky lg:top-8 space-y-3">
        <div className="font-bold">Итог</div>
        <Row label="Выручка всего" value={eur(total)} strong />
        <Row label="Ожидается в кассе" value={eur(expected)} />
        <Row label="Фактически" value={f.cash_end === '' ? '—' : eur(parseMoney(f.cash_end))} />
        {diff !== null && (
          <div className={cx('rounded-2xl p-3 flex items-center gap-2 text-sm font-semibold', diff === 0 ? 'bg-ok/10 text-ok' : 'bg-warn/10 text-warn')}>
            {diff === 0 ? <Check className="size-4" /> : <AlertTriangle className="size-4" />}
            {diff === 0 ? 'Касса сходится' : `Расхождение ${diff > 0 ? '+' : ''}${eur(diff)}`}
          </div>
        )}
        <Button block size="lg" loading={busy} disabled={f.cash_end === ''} onClick={submit}>Отправить отчёт</Button>
      </Card>
    </div>
  );
}

const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex justify-between text-sm"><span className="text-muted">{label}</span><span className={cx('font-mono tabular-nums', strong && 'font-bold text-base')}>{value}</span></div>
);

function Envelopes() {
  const { isDirector } = useAuth();
  const { data: envs, reload } = useApi<Envelope[]>('/envelopes');
  const { data: txs, reload: reloadTx } = useApi<EnvelopeTx[]>('/envelopes/tx');
  const [move, setMove] = useState<Envelope | null>(null);
  const [newEnv, setNewEnv] = useState(false);
  const total = envs?.reduce((a, e) => a + e.balance_cents, 0) || 0;

  return (
    <div>
      <Card className="mb-3 bg-gradient-to-br from-accent/20 to-accent-2/10 border-accent/30">
        <div className="text-sm text-muted font-semibold">Всего наличных в конвертах</div>
        <div className="text-3xl font-extrabold tracking-tight mt-1 tabular-nums">{eur(total)}</div>
      </Card>
      {!envs ? <Spinner /> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {envs.map((e) => (
            <Card key={e.id} onClick={() => setMove(e)} className="relative overflow-hidden">
              <span className="absolute -right-6 -top-6 size-20 rounded-full opacity-20" style={{ background: e.color || 'var(--accent)' }} />
              <Mail className="size-5" style={{ color: e.color || 'var(--accent)' }} />
              <div className="text-sm font-semibold mt-2 truncate">{e.name}</div>
              <div className={cx('text-xl font-extrabold tabular-nums', e.balance_cents < 0 && 'text-bad')}>{eur(e.balance_cents)}</div>
            </Card>
          ))}
          {isDirector && (
            <button onClick={() => setNewEnv(true)} className="rounded-3xl border-2 border-dashed border-line text-muted hover:text-accent hover:border-accent/50 grid place-items-center min-h-28 transition">
              <span className="flex flex-col items-center gap-1 text-sm font-semibold"><Plus className="size-5" />Конверт</span>
            </button>
          )}
        </div>
      )}
      <SectionTitle>Движения</SectionTitle>
      {!txs ? <Spinner /> : txs.length === 0 ? <Empty title="Движений пока нет" /> : (
        <Card className="p-1.5">
          {txs.map((t) => (
            <div key={t.id} className="flex items-center gap-3 p-2.5">
              <span className={cx('grid size-9 place-items-center rounded-2xl', t.amount_cents > 0 ? 'bg-ok/12 text-ok' : 'bg-bad/12 text-bad')}>
                {t.amount_cents > 0 ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{t.note || '—'}</div>
                <div className="text-xs text-muted">{t.envelope_name} · {t.user_name} · {timeAgo(t.created_at)}</div>
              </div>
              <span className={cx('font-mono font-semibold tabular-nums', t.amount_cents > 0 ? 'text-ok' : 'text-bad')}>{t.amount_cents > 0 ? '+' : ''}{eur(t.amount_cents)}</span>
            </div>
          ))}
        </Card>
      )}
      {move && envs && <MoveSheet env={move} envs={envs} onClose={() => setMove(null)} onSaved={() => { reload(); reloadTx(); }} />}
      {newEnv && <NewEnvelope onClose={() => setNewEnv(false)} onSaved={reload} />}
    </div>
  );
}

function MoveSheet({ env, envs, onClose, onSaved }: { env: Envelope; envs: Envelope[]; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<'in' | 'out' | 'transfer'>('out');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [to, setTo] = useState(String(envs.find((e) => e.id !== env.id)?.id || ''));
  const { busy, run } = useAction();
  const save = () => run(async () => {
    const a = Math.abs(parseMoney(amount)) / 100;
    await api.post(`/envelopes/${env.id}/tx`, { amount: kind === 'out' ? -a : a, note, to_envelope_id: kind === 'transfer' ? to : undefined });
    onSaved(); onClose();
  }, 'Сохранено');
  return (
    <Sheet open onClose={onClose} title={`Конверт «${env.name}»`} footer={<Button block size="lg" loading={busy} disabled={!amount || !note} onClick={save}>Сохранить</Button>}>
      <div className="text-center py-2"><div className="text-sm text-muted">Остаток</div><div className="text-3xl font-extrabold tabular-nums">{eur(env.balance_cents)}</div></div>
      <Segmented value={kind} onChange={setKind} options={[
        { value: 'out', label: <><ArrowUpRight className="size-4" />Взять</> }, { value: 'in', label: <><ArrowDownLeft className="size-4" />Положить</> },
        { value: 'transfer', label: <><ArrowLeftRight className="size-4" />Переложить</> },
      ]} />
      <Field label="Сумма"><MoneyInput value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></Field>
      {kind === 'transfer' && (
        <Field label="В конверт"><Select value={to} onChange={(e) => setTo(e.target.value)}>{envs.filter((e) => e.id !== env.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</Select></Field>
      )}
      <Field label="Назначение" hint="Обязательно — директор видит каждое движение"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Инкассация, закупка, зарплата…" /></Field>
    </Sheet>
  );
}

function NewEnvelope({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#8b6cff');
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title="Новый конверт" footer={<Button block size="lg" loading={busy} disabled={!name.trim()} onClick={() => run(async () => { await api.post('/envelopes', { name, color }); onSaved(); onClose(); }, 'Конверт создан')}>Создать</Button>}>
      <Field label="Название"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например: Ремонт" autoFocus /></Field>
      <Field label="Цвет"><Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="p-1.5" /></Field>
    </Sheet>
  );
}

function History() {
  const { isDirector } = useAuth();
  const { data, reload } = useApi<CashReport[]>('/cash/reports');
  const [sel, setSel] = useState<CashReport | null>(null);
  if (!data) return <Spinner />;
  if (!data.length) return <Empty icon={<Receipt />} title="Отчётов пока нет" />;
  return (
    <>
      <div className="space-y-2">
        {data.map((c) => (
          <Card key={c.id} onClick={() => setSel(c)} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold capitalize">{dayLabel(c.date)}</span>
                <Badge tone={c.status === 'approved' ? 'ok' : c.status === 'disputed' ? 'bad' : 'warn'}>{c.status === 'approved' ? 'Принят' : c.status === 'disputed' ? 'Есть вопрос' : 'На проверке'}</Badge>
              </div>
              <div className="text-xs text-muted mt-0.5">{c.user_name} · нал {eur(c.cash_revenue_cents)} · карта {eur(c.card_revenue_cents)}</div>
            </div>
            <div className="text-right">
              <div className="font-mono font-bold tabular-nums">{eur(c.cash_revenue_cents + c.card_revenue_cents)}</div>
              {c.difference_cents !== 0 && <div className="text-xs font-semibold text-warn tabular-nums">{c.difference_cents > 0 ? '+' : ''}{eur(c.difference_cents)}</div>}
            </div>
          </Card>
        ))}
      </div>
      {sel && <ReportSheet c={sel} canReview={isDirector} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
    </>
  );
}

function ReportSheet({ c, canReview, onClose, onSaved }: { c: CashReport; canReview: boolean; onClose: () => void; onSaved: () => void }) {
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();
  const review = (status: string) => run(async () => { await api.post(`/cash/reports/${c.id}/review`, { status, comment }); onSaved(); }, 'Сохранено');
  return (
    <Sheet open onClose={onClose} title={`Отчёт · ${dayLabel(c.date)}`}>
      <p className="text-sm text-muted -mt-2">{c.user_name}</p>
      <Card className="space-y-2 bg-surface-2">
        <Row label="Касса на начало" value={eur(c.cash_start_cents)} />
        <Row label="Наличные" value={eur(c.cash_revenue_cents)} />
        <Row label="Карта" value={eur(c.card_revenue_cents)} />
        <Row label={`Расходы${c.expenses_note ? ` (${c.expenses_note})` : ''}`} value={`−${eur(c.expenses_cents)}`} />
        <Row label={`В конверт${c.envelope_name ? ` «${c.envelope_name}»` : ''}`} value={`−${eur(c.to_envelope_cents)}`} />
        <div className="border-t border-line pt-2 space-y-2">
          <Row label="Ожидалось" value={eur(c.expected_cash_cents)} />
          <Row label="Фактически" value={eur(c.cash_end_cents)} strong />
          <Row label="Расхождение" value={`${c.difference_cents > 0 ? '+' : ''}${eur(c.difference_cents)}`} />
        </div>
      </Card>
      {c.comment && <p className="text-sm"><span className="text-muted">Комментарий: </span>{c.comment}</p>}
      {c.director_comment && <p className="text-sm"><span className="text-muted">Директор: </span>{c.director_comment}</p>}
      {canReview && c.status === 'submitted' && (
        <>
          <Field label="Комментарий директора"><Input value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="danger" loading={busy} onClick={() => review('disputed')}>Есть вопрос</Button>
            <Button variant="success" loading={busy} icon={<Check className="size-4" />} onClick={() => review('approved')}>Принять</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
