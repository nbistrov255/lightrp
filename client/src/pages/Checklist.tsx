import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Camera, ArrowLeft, PartyPopper, History as HistoryIcon, ClipboardCheck } from 'lucide-react';
import { api, type ChecklistRun } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { dateTime, dayLabel } from '../lib/format';
import { Badge, Button, Card, Empty, ErrorBox, PageHeader, PhotoGrid, QuickPhoto, SectionTitle, Segmented, Spinner, Textarea, cx, useAction } from '../components/ui';

export default function Checklist() {
  const { id } = useParams();
  const { isDirector } = useAuth();
  const [tab, setTab] = useState<'today' | 'history'>(id ? 'history' : 'today');
  if (id) return <RunView url={`/checklist/runs/${id}`} readonly />;
  return (
    <div>
      <PageHeader title="Чек-лист смены" subtitle="Стартовая проверка клуба с фотоотчётом" />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'today', label: 'Моя смена' }, { value: 'history', label: isDirector ? 'Все чек-листы' : 'История' }]} />
      {tab === 'today' ? <RunView url="/checklist/today" /> : <History />}
    </div>
  );
}

function RunView({ url, readonly }: { url: string; readonly?: boolean }) {
  const nav = useNavigate();
  const { data: r, error, reload, setData } = useApi<ChecklistRun>(url);
  const [pending, setPending] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const { busy, run } = useAction();

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!r) return <Spinner />;
  const locked = readonly || r.status === 'completed';
  const done = r.items.filter((i) => i.done && (!i.photo_required || i.photos.length)).length;
  const pct = r.items.length ? Math.round((done / r.items.length) * 100) : 0;

  const mark = (itemId: number, value: boolean, files: File[] = []) => run(async () => {
    setPending(itemId);
    const fd = new FormData();
    fd.append('done', value ? '1' : '0');
    files.forEach((f) => fd.append('photos', f));
    try { setData(await api.post<ChecklistRun>(`/checklist/runs/${r.id}/items/${itemId}`, fd)); } finally { setPending(null); }
  });

  return (
    <div className="max-w-2xl">
      {readonly && (
        <>
          <Button variant="ghost" size="sm" className="-ml-2 mb-2" icon={<ArrowLeft className="size-4" />} onClick={() => nav(-1)}>Назад</Button>
          <h1 className="text-2xl font-extrabold mb-1">Чек-лист · {r.user_name}</h1>
          <p className="text-muted text-sm mb-4">{dayLabel(r.date)}{r.completed_at && ` · завершён ${dateTime(r.completed_at)}`}</p>
        </>
      )}

      <Card className="mb-3 sticky top-[calc(env(safe-area-inset-top)+60px)] md:top-4 z-20 backdrop-blur-xl bg-surface/90">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold">{r.status === 'completed' ? 'Завершён' : 'Прогресс'}</span>
          <span className="font-mono font-semibold">{done}/{r.items.length}</span>
        </div>
        <div className="h-2.5 rounded-full bg-surface-3 overflow-hidden">
          <div className={cx('h-full rounded-full transition-all duration-500', r.status === 'completed' ? 'bg-ok' : 'bg-gradient-to-r from-accent to-accent-2')} style={{ width: `${pct}%` }} />
        </div>
      </Card>

      {r.status === 'completed' && !readonly && (
        <Card className="mb-3 border-ok/30 bg-ok/5 flex items-center gap-3">
          <PartyPopper className="size-6 text-ok" />
          <div><div className="font-bold">Отличный старт смены!</div><div className="text-sm text-muted">Директор получил уведомление</div></div>
        </Card>
      )}

      <div className="space-y-2">
        {r.items.map((i) => {
          const needPhoto = !!i.photo_required && !i.photos.length;
          const ok = !!i.done && !needPhoto;
          return (
            <Card key={i.item_id} className={cx('p-3 transition', ok && 'border-ok/30')}>
              <div className="flex items-center gap-3">
                <button
                  disabled={locked || pending === i.item_id}
                  onClick={() => mark(i.item_id, !i.done)}
                  className={cx('grid size-10 shrink-0 place-items-center rounded-2xl border-2 transition active:scale-90',
                    i.done ? 'bg-ok border-ok text-white' : 'border-line text-transparent hover:border-accent')}
                >
                  <Check className="size-5" strokeWidth={3} />
                </button>
                <div className="flex-1 min-w-0" onClick={() => !locked && mark(i.item_id, !i.done)}>
                  <div className={cx('font-semibold leading-snug', i.done && 'text-muted line-through decoration-2')}>{i.title}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted">
                    {i.zone && <span>{i.zone}</span>}
                    {!!i.photo_required && <span className={cx('inline-flex items-center gap-1', needPhoto && i.done ? 'text-bad font-semibold' : '')}><Camera className="size-3" />{needPhoto ? 'нужно фото' : 'фото есть'}</span>}
                  </div>
                </div>
                {!locked && <QuickPhoto busy={pending === i.item_id} onFiles={(f) => mark(i.item_id, true, f)} />}
              </div>
              {i.photos.length > 0 && <div className="mt-2.5 pl-[52px]"><PhotoGrid photos={i.photos} size={56} /></div>}
            </Card>
          );
        })}
        {r.items.length === 0 && <Empty icon={<ClipboardCheck />} title="Пункты чек-листа не настроены" text="Директор может добавить их в настройках" />}
      </div>

      {!locked && r.items.length > 0 && (
        <Card className="mt-4 space-y-3">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий к смене (необязательно)" />
          <Button block size="lg" disabled={done < r.items.length} loading={busy} icon={<Check className="size-5" />}
            onClick={() => run(async () => { setData(await api.post<ChecklistRun>(`/checklist/runs/${r.id}/complete`, { comment })); }, 'Чек-лист завершён')}>
            {done < r.items.length ? `Осталось ${r.items.length - done}` : 'Завершить чек-лист'}
          </Button>
        </Card>
      )}
      {r.comment && <Card className="mt-3 text-sm"><span className="text-muted">Комментарий: </span>{r.comment}</Card>}
    </div>
  );
}

function History() {
  const nav = useNavigate();
  const { data } = useApi<(ChecklistRun & { done_count: number })[]>('/checklist/runs');
  if (!data) return <Spinner />;
  if (!data.length) return <Empty icon={<HistoryIcon />} title="Истории пока нет" />;
  return (
    <Card className="p-1.5">
      {data.map((r) => (
        <button key={r.id} onClick={() => nav(`/checklist/${r.id}`)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-2 text-left">
          <div className="flex-1">
            <div className="font-semibold">{r.user_name}</div>
            <div className="text-xs text-muted">{dayLabel(r.date)} · отмечено {r.done_count}</div>
          </div>
          <Badge tone={r.status === 'completed' ? 'ok' : 'warn'}>{r.status === 'completed' ? 'Готово' : 'В процессе'}</Badge>
        </button>
      ))}
    </Card>
  );
}
