import { useState } from 'react';
import { CalendarClock, Phone, Users, MapPin, Plus, Check, X, MessageSquare, Globe, Mail } from 'lucide-react';
import { api, type Booking } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BOOKING_SOURCE, BOOKING_STATUS, useSettings } from '../lib/meta';
import { dateShort, dateTime, timeAgo, todayISO } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, Segmented, Select, Sheet, Spinner, Textarea, cx, useAction } from '../components/ui';

export default function Bookings() {
  const [status, setStatus] = useState<'active' | 'archive'>('active');
  const { data, reload } = useApi<Booking[]>(`/bookings?status=${status}`);
  const [sel, setSel] = useState<Booking | null>(null);
  const [add, setAdd] = useState(false);
  const fresh = data?.filter((b) => b.status === 'new').length || 0;

  return (
    <div>
      <PageHeader title="Брони" subtitle="Заявки с сайта (RU и LV) — дублируются в Discord"
        action={<Button variant="secondary" icon={<Plus className="size-5" />} onClick={() => setAdd(true)}><span className="hidden sm:inline">Добавить</span></Button>} />
      <Segmented className="mb-4" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Активные', count: fresh }, { value: 'archive', label: 'Архив' }]} />
      {!data ? <Spinner /> : data.length === 0 ? <Empty icon={<CalendarClock />} title="Броней нет" text="Новые заявки с сайта появятся здесь автоматически" /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((b) => (
            <Card key={b.id} onClick={() => setSel(b)} glow={b.status === 'new'}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-[17px] truncate">{b.name || 'Без имени'}</div>
                  <div className="text-xs text-muted mt-0.5 inline-flex items-center gap-1"><Globe className="size-3" />{BOOKING_SOURCE[b.source] || b.source} · {timeAgo(b.created_at)}</div>
                </div>
                <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(b.date || b.time) && <Chip icon={<CalendarClock className="size-3.5" />} strong>{[dateShort(b.date), b.time].filter(Boolean).join(' · ')}</Chip>}
                {b.guests && <Chip icon={<Users className="size-3.5" />}>{b.guests}</Chip>}
                {b.zone && <Chip icon={<MapPin className="size-3.5" />}>{b.zone}</Chip>}
              </div>
            </Card>
          ))}
        </div>
      )}
      {sel && <BookingSheet b={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
      {add && <AddBooking onClose={() => setAdd(false)} onSaved={reload} />}
    </div>
  );
}

const Chip = ({ icon, children, strong }: { icon: React.ReactNode; children: React.ReactNode; strong?: boolean }) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-xl bg-surface-2 border border-line px-2.5 h-8 text-[13px]', strong ? 'font-bold' : 'text-muted font-medium')}>{icon}{children}</span>
);

function BookingSheet({ b, onClose, onSaved }: { b: Booking; onClose: () => void; onSaved: () => void }) {
  const { busy, run } = useAction();
  const set = (status: string) => run(async () => { await api.patch(`/bookings/${b.id}`, { status }); onSaved(); }, 'Статус обновлён');
  let extra: [string, string][] = [];
  try {
    // Показываем только поля, которые не распознались как имя/телефон/дата и т. д.
    const shown = new Set([b.name, b.phone, b.email, b.date, b.time, b.guests, b.zone, b.comment].filter(Boolean).map(String));
    extra = Object.entries(JSON.parse(b.raw || '{}') as Record<string, string>).filter(([, v]) => v && !shown.has(String(v).trim()));
  } catch { /* ignore */ }
  return (
    <Sheet open onClose={onClose} title={b.name || 'Бронь'}>
      <div className="flex flex-wrap gap-1.5 -mt-2">
        <Badge tone={BOOKING_STATUS[b.status].tone}>{BOOKING_STATUS[b.status].label}</Badge>
        <Badge tone="info">{BOOKING_SOURCE[b.source] || b.source}</Badge>
        {!!b.discord_sent && <Badge tone="accent">Discord ✓</Badge>}
      </div>
      <Card className="bg-surface-2 space-y-3">
        {b.phone && <a href={`tel:${b.phone.replace(/\s/g, '')}`} className="flex items-center gap-3 font-semibold text-accent"><Phone className="size-4" />{b.phone}</a>}
        {b.email && <a href={`mailto:${b.email}`} className="flex items-center gap-3 text-accent"><Mail className="size-4" />{b.email}</a>}
        {(b.date || b.time) && <div className="flex items-center gap-3"><CalendarClock className="size-4 text-muted" />{[dateShort(b.date), b.time].filter(Boolean).join(' · ')}</div>}
        {b.guests && <div className="flex items-center gap-3"><Users className="size-4 text-muted" />{b.guests}</div>}
        {b.zone && <div className="flex items-center gap-3"><MapPin className="size-4 text-muted" />{b.zone}</div>}
        {b.comment && <div className="flex gap-3"><MessageSquare className="size-4 text-muted mt-0.5 shrink-0" /><span className="whitespace-pre-wrap">{b.comment}</span></div>}
        {extra.map(([k, v]) => <div key={k} className="text-sm"><span className="text-muted">{k}: </span>{v}</div>)}
      </Card>
      <p className="text-xs text-muted">Получено {dateTime(b.created_at)}{b.handled_by_name && ` · обработал(а) ${b.handled_by_name}`}</p>
      {b.phone && (
        <div className="grid grid-cols-2 gap-2">
          <a href={`tel:${b.phone.replace(/\s/g, '')}`}><Button block variant="secondary" icon={<Phone className="size-4" />}>Позвонить</Button></a>
          <a href={`https://wa.me/${b.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"><Button block variant="secondary" icon={<MessageSquare className="size-4" />}>WhatsApp</Button></a>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {b.status === 'new' && <Button className="col-span-2" size="lg" variant="success" loading={busy} icon={<Check className="size-5" />} onClick={() => set('confirmed')}>Подтвердить</Button>}
        {b.status === 'confirmed' && <Button className="col-span-2" variant="secondary" loading={busy} onClick={() => set('done')}>Гости пришли</Button>}
        {(b.status === 'new' || b.status === 'confirmed') && <Button className="col-span-2" variant="danger" loading={busy} icon={<X className="size-4" />} onClick={() => set('cancelled')}>Отменить</Button>}
        {(b.status === 'cancelled' || b.status === 'done') && <Button className="col-span-2" variant="secondary" loading={busy} onClick={() => set('confirmed')}>Вернуть в активные</Button>}
      </div>
    </Sheet>
  );
}

function AddBooking({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const settings = useSettings();
  const [f, setF] = useState({ name: '', phone: '', date: todayISO(), time: '', guests: '', zone: '', comment: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title="Бронь по телефону" footer={<Button block size="lg" loading={busy} disabled={!f.name.trim()} onClick={() => run(async () => { await api.post('/bookings', f); onSaved(); onClose(); }, 'Бронь добавлена')}>Сохранить</Button>}>
      <Field label="Имя"><Input value={f.name} onChange={set('name')} autoFocus /></Field>
      <Field label="Телефон"><Input type="tel" value={f.phone} onChange={set('phone')} placeholder="+371" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата"><Input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Время"><Input type="time" value={f.time} onChange={set('time')} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Гостей / ПК"><Input inputMode="numeric" value={f.guests} onChange={set('guests')} /></Field>
        <Field label="Зона"><Select value={f.zone} onChange={set('zone')}><option value="">—</option>{settings?.zones.map((z) => <option key={z}>{z}</option>)}</Select></Field>
      </div>
      <Field label="Комментарий"><Textarea value={f.comment} onChange={set('comment')} /></Field>
    </Sheet>
  );
}
