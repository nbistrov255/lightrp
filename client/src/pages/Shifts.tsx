import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Trash2, FileSpreadsheet, CalendarDays } from 'lucide-react';
import { api, type Shift, type User } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { addDays, dayLabel, timeAgo, todayISO } from '../lib/format';
import { Avatar, Badge, Button, Card, Empty, Field, IconButton, Input, PageHeader, Select, Sheet, Spinner, cx, useAction } from '../components/ui';

function weekStart(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  return addDays(iso, -wd);
}

export default function Shifts() {
  const { user, isDirector } = useAuth();
  const [start, setStart] = useState(() => weekStart(todayISO()));
  const end = addDays(start, 6);
  const { data, reload } = useApi<{ shifts: Shift[]; lastSync: string; sheetConfigured: boolean }>(`/shifts?from=${start}&to=${end}`);
  const [add, setAdd] = useState(false);
  const { busy, run } = useAction();
  const today = todayISO();

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const byDay = useMemo(() => {
    const m: Record<string, Shift[]> = {};
    for (const s of data?.shifts || []) (m[s.date] ||= []).push(s);
    return m;
  }, [data]);
  const myCount = data?.shifts.filter((s) => s.user_id === user?.id).length || 0;

  return (
    <div>
      <PageHeader title="Смены" subtitle={<span className="inline-flex items-center gap-1.5"><FileSpreadsheet className="size-4" />Из Google Таблицы{data?.lastSync ? ` · обновлено ${timeAgo(data.lastSync)}` : ''}</span>}
        action={isDirector && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setAdd(true)}><span className="hidden sm:inline">Добавить</span></Button>
            {data?.sheetConfigured && <Button size="sm" loading={busy} icon={<RefreshCw className="size-4" />} onClick={() => run(async () => { const r = await api.post<{ imported: number }>('/shifts/sync'); reload(); return r; }, 'Смены обновлены')}>Синхр.</Button>}
          </div>
        )} />

      <Card className="flex items-center justify-between p-2 mb-4">
        <IconButton onClick={() => setStart(addDays(start, -7))}><ChevronLeft className="size-5" /></IconButton>
        <button onClick={() => setStart(weekStart(today))} className="text-center">
          <div className="font-bold">{new Date(`${start}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })} — {new Date(`${end}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</div>
          <div className="text-xs text-muted">{myCount ? `У вас ${myCount} смен(ы) на этой неделе` : 'Нажмите, чтобы вернуться к текущей неделе'}</div>
        </button>
        <IconButton onClick={() => setStart(addDays(start, 7))}><ChevronRight className="size-5" /></IconButton>
      </Card>

      {!data ? <Spinner /> : data.shifts.length === 0 ? (
        <Empty icon={<CalendarDays />} title="Смен на этой неделе нет" text={data.sheetConfigured ? 'Проверьте Google Таблицу или нажмите «Синхр.»' : 'Google Таблица ещё не подключена — директор может добавить смены вручную'} />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {days.map((d) => (
            <Card key={d} className={cx('p-3', d === today && 'border-accent/50 shadow-[0_0_0_1px_var(--accent)]', d < today && 'opacity-60')}>
              <div className="flex items-center justify-between px-1 mb-1">
                <div className="font-bold capitalize">{dayLabel(d)}</div>
                {d === today && <Badge tone="accent">сегодня</Badge>}
              </div>
              {(byDay[d] || []).length === 0 && <div className="text-sm text-muted px-1 py-2">—</div>}
              {(byDay[d] || []).map((s) => (
                <div key={s.id} className={cx('flex items-center gap-2.5 p-1.5 rounded-xl', s.user_id === user?.id && 'bg-accent/8')}>
                  <Avatar name={s.user_name || s.employee_name} size={30} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{s.user_name || s.employee_name}{!s.user_id && <span className="text-warn text-xs font-normal"> · нет аккаунта</span>}</div>
                    {s.note && <div className="text-xs text-muted truncate">{s.note}</div>}
                  </div>
                  <span className="font-mono text-[13px] text-muted">{s.start_time}–{s.end_time}</span>
                  {isDirector && s.source === 'manual' && <button onClick={() => run(async () => { await api.del(`/shifts/${s.id}`); reload(); })} className="text-muted hover:text-bad"><Trash2 className="size-4" /></button>}
                </div>
              ))}
            </Card>
          ))}
        </div>
      )}
      {add && <AddShift onClose={() => setAdd(false)} onSaved={reload} />}
    </div>
  );
}

function AddShift({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { data: users } = useApi<User[]>('/users');
  const [f, setF] = useState({ user_id: '', date: todayISO(), start_time: '10:00', end_time: '18:00', note: '' });
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title="Добавить смену" footer={
      <Button block size="lg" loading={busy} disabled={!f.user_id} onClick={() => run(async () => { await api.post('/shifts', f); onSaved(); onClose(); }, 'Смена добавлена')}>Сохранить</Button>
    }>
      <p className="text-sm text-muted">Для срочных замен. Основной график ведётся в Google Таблице — ручные смены не перезаписываются синхронизацией.</p>
      <Field label="Сотрудник">
        <Select value={f.user_id} onChange={(e) => setF({ ...f, user_id: e.target.value })}>
          <option value="">Выберите</option>
          {users?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Дата"><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Начало"><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
        <Field label="Конец"><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
      </div>
      <Field label="Комментарий"><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Например: замена Анны" /></Field>
    </Sheet>
  );
}
