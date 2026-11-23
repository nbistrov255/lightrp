import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, ListChecks, CalendarClock, Wrench, Wallet, Star, ChevronRight, AlertTriangle, Clock, Inbox, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Avatar, Badge, Button, Card, ErrorBox, SectionTitle, Spinner, Stat, cx } from '../components/ui';
import { BOOKING_SOURCE, PRIORITY } from '../lib/meta';
import { dateShort, dayLabel, deadlineLabel, isOverdue, plural } from '../lib/format';
import type { Priority, Shift } from '../lib/api';

interface Dash {
  date: string;
  shiftsToday: Shift[];
  myNextShift: Shift | null;
  checklist: { id?: number; status: string; done: number; total: number };
  tasks: { active: number; overdue: number; review: number; top: { id: number; title: string; priority: Priority; deadline?: string; zone?: string; status: string; assignee_name?: string }[] };
  bookings: { new: number; latest: { id: number; name?: string; date?: string; time?: string; guests?: string; source: string; status: string }[] };
  breakdownsOpen: number;
  breakdownsCritical: number;
  cashReportToday: boolean;
  points: number;
  approvals: { advances: number; exchanges: number; cash: number } | null;
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', timeZone: 'Europe/Riga' }).format(new Date()));
  return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер';
}

export default function Dashboard() {
  const { user, isDirector } = useAuth();
  const nav = useNavigate();
  const { data: d, error, reload } = useApi<Dash>('/dashboard');

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!d) return <Spinner />;

  const ck = d.checklist;
  const ckPct = ck.total ? Math.round((ck.done / ck.total) * 100) : 0;
  const onShiftNow = d.shiftsToday.some((s) => s.user_id === user?.id);
  const approvalsTotal = d.approvals ? d.approvals.advances + d.approvals.exchanges + d.approvals.cash + d.tasks.review : 0;

  return (
    <div>
      <div className="mb-5">
        <p className="text-muted text-sm font-medium capitalize">{new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Riga' })}</p>
        <h1 className="text-[28px] md:text-4xl font-extrabold tracking-tight leading-tight">{greeting()}, {user?.name.split(' ')[0]} 👋</h1>
      </div>

      {/* Главное действие: чек-лист начала смены */}
      {!isDirector || onShiftNow ? (
        <Card glow={ck.status !== 'completed'} onClick={() => nav('/checklist')} className="relative overflow-hidden">
          <div className="flex items-center gap-4">
            <div className="relative size-16 shrink-0">
              <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-3)" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={ck.status === 'completed' ? 'var(--ok)' : 'var(--accent)'} strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${ckPct * 0.974} 100`} />
              </svg>
              <span className="absolute inset-0 grid place-items-center">
                {ck.status === 'completed' ? <CheckCircle2 className="size-6 text-ok" /> : <span className="text-sm font-extrabold">{ckPct}%</span>}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-bold text-[17px]">{ck.status === 'completed' ? 'Чек-лист смены выполнен' : ck.status === 'not_started' ? 'Начните смену с чек-листа' : 'Продолжите чек-лист смены'}</div>
              <div className="text-sm text-muted mt-0.5">{ck.done} из {ck.total} пунктов{ck.status !== 'completed' && ' · с фотоотчётом'}</div>
            </div>
            <ChevronRight className="size-5 text-muted" />
          </div>
        </Card>
      ) : null}

      {/* Директор: что ждёт решения */}
      {isDirector && approvalsTotal > 0 && (
        <Card className="mt-3 border-warn/30 bg-warn/5">
          <div className="flex items-center gap-2 font-bold"><Inbox className="size-5 text-warn" /> Ждут вашего решения</div>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { n: d.tasks.review, label: 'задачи на проверке', to: '/tasks?scope=review' },
              { n: d.approvals!.advances, label: 'запросы авансов', to: '/money' },
              { n: d.approvals!.exchanges, label: 'обмен баллов', to: '/money' },
              { n: d.approvals!.cash, label: 'кассовые отчёты', to: '/cash' },
            ].filter((x) => x.n).map((x) => (
              <button key={x.label} onClick={() => nav(x.to)} className="text-left rounded-2xl bg-surface border border-line p-3 hover:border-warn/40 transition">
                <div className="text-xl font-extrabold">{x.n}</div>
                <div className="text-xs text-muted leading-tight">{x.label}</div>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Мои задачи" icon={<ListChecks className="size-5" />} value={d.tasks.active}
          hint={d.tasks.overdue ? <span className="text-bad font-semibold">{d.tasks.overdue} просрочено</span> : 'без просрочек'} onClick={() => nav('/tasks')} />
        <Stat label="Новые брони" icon={<CalendarClock className="size-5" />} tone="info" value={d.bookings.new} hint="с сайта RU / LV" onClick={() => nav('/bookings')} />
        <Stat label="Поломки" icon={<Wrench className="size-5" />} tone={d.breakdownsCritical ? 'bad' : 'warn'} value={d.breakdownsOpen}
          hint={d.breakdownsCritical ? <span className="text-bad font-semibold">{d.breakdownsCritical} критич.</span> : 'открытых'} onClick={() => nav('/breakdowns')} />
        <Stat label="Мои баллы" icon={<Star className="size-5" />} tone="ok" value={d.points} hint="обменять на деньги" onClick={() => nav('/money')} />
      </div>

      {!d.cashReportToday && !isDirector && (
        <Card className="mt-3 flex items-center gap-3" onClick={() => nav('/cash')}>
          <span className="grid size-10 place-items-center rounded-2xl bg-accent-2/12 text-accent-2"><Wallet className="size-5" /></span>
          <div className="flex-1">
            <div className="font-semibold">Кассовый отчёт за сегодня</div>
            <div className="text-sm text-muted">Заполните в конце смены</div>
          </div>
          <ChevronRight className="size-5 text-muted" />
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-x-6">
        <div>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => nav('/tasks')}>Все</Button>}>Приоритетные задачи</SectionTitle>
          <Card className="p-1.5">
            {d.tasks.top.length === 0 && <div className="p-4 text-sm text-muted">Активных задач нет 🎉</div>}
            {d.tasks.top.map((t) => (
              <button key={t.id} onClick={() => nav(`/tasks/${t.id}`)} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-2 text-left transition">
                <span className={cx('w-1 self-stretch rounded-full', { urgent: 'bg-bad', high: 'bg-warn', normal: 'bg-accent', low: 'bg-surface-3' }[t.priority])} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{t.title}</div>
                  <div className="text-xs text-muted flex items-center gap-2 mt-0.5">
                    {t.deadline && <span className={cx('inline-flex items-center gap-1', isOverdue(t.deadline) && 'text-bad font-semibold')}><Clock className="size-3" />{deadlineLabel(t.deadline)}</span>}
                    {t.zone && <span>{t.zone}</span>}
                    {isDirector && t.assignee_name && <span>· {t.assignee_name}</span>}
                  </div>
                </div>
                <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
              </button>
            ))}
          </Card>
        </div>

        <div>
          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => nav('/shifts')}>График</Button>}>Сегодня на смене</SectionTitle>
          <Card className="p-1.5">
            {d.shiftsToday.length === 0 && <div className="p-4 text-sm text-muted">Смен на сегодня нет в таблице</div>}
            {d.shiftsToday.map((s) => (
              <div key={s.id} className="flex items-center gap-3 p-2.5">
                <Avatar name={s.user_name || s.employee_name} />
                <div className="flex-1 font-semibold">{s.user_name || s.employee_name}{s.user_id === user?.id && <span className="text-muted font-normal"> · вы</span>}</div>
                <span className="font-mono text-sm text-muted">{s.start_time}–{s.end_time}</span>
              </div>
            ))}
          </Card>
          {d.myNextShift && d.myNextShift.date !== d.date && (
            <p className="text-sm text-muted mt-2 px-1">Ваша следующая смена: <b className="text-text">{dayLabel(d.myNextShift.date)}, {d.myNextShift.start_time}–{d.myNextShift.end_time}</b></p>
          )}

          <SectionTitle action={<Button size="sm" variant="ghost" onClick={() => nav('/bookings')}>Все</Button>}>Последние брони</SectionTitle>
          <Card className="p-1.5">
            {d.bookings.latest.length === 0 && <div className="p-4 text-sm text-muted">Активных броней нет</div>}
            {d.bookings.latest.map((b) => (
              <button key={b.id} onClick={() => nav('/bookings')} className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-surface-2 text-left">
                <span className="grid size-10 place-items-center rounded-2xl bg-accent-2/12 text-accent-2"><CalendarClock className="size-5" /></span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{b.name || 'Без имени'}{b.guests && <span className="text-muted font-normal"> · {b.guests} {plural(Number(b.guests) || 0, 'гость', 'гостя', 'гостей')}</span>}</div>
                  <div className="text-xs text-muted">{[dateShort(b.date), b.time].filter(Boolean).join(', ') || 'дата не указана'} · {BOOKING_SOURCE[b.source] || b.source}</div>
                </div>
                {b.status === 'new' && <Badge tone="bad">Новая</Badge>}
              </button>
            ))}
          </Card>
        </div>
      </div>

      {d.breakdownsCritical > 0 && (
        <Card className="mt-4 border-bad/30 bg-bad/5 flex items-center gap-3" onClick={() => nav('/breakdowns')}>
          <AlertTriangle className="size-5 text-bad" />
          <div className="flex-1 text-sm"><b>{d.breakdownsCritical}</b> {plural(d.breakdownsCritical, 'критическая поломка', 'критические поломки', 'критических поломок')} — требует внимания</div>
          <ChevronRight className="size-5 text-muted" />
        </Card>
      )}
    </div>
  );
}
