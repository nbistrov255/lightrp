import { useState } from 'react';
import { Plus, Wrench, Monitor, MapPin, Check, Hammer } from 'lucide-react';
import { api, type Breakdown } from '../lib/api';
import { useApi } from '../lib/hooks';
import { BREAKDOWN_STATUS, SEVERITY, useSettings } from '../lib/meta';
import { timeAgo, dateTime } from '../lib/format';
import { Badge, Button, Card, Empty, Field, Input, PageHeader, PhotoGrid, PhotoPicker, Segmented, Select, Sheet, Spinner, Textarea, cx, useAction } from '../components/ui';

export default function Breakdowns() {
  const [status, setStatus] = useState<'open' | 'fixed'>('open');
  const { data, reload } = useApi<Breakdown[]>(`/breakdowns?status=${status}`);
  const [form, setForm] = useState(false);
  const [sel, setSel] = useState<Breakdown | null>(null);

  return (
    <div>
      <PageHeader title="Журнал поломок" subtitle="Техника, мебель и всё, что требует ремонта"
        action={<Button variant="danger" icon={<Plus className="size-5" />} onClick={() => setForm(true)}>Сообщить</Button>} />
      <Segmented className="mb-4" value={status} onChange={setStatus} options={[{ value: 'open', label: 'Открытые', count: status === 'open' ? data?.length : undefined }, { value: 'fixed', label: 'Исправленные' }]} />
      {!data ? <Spinner /> : data.length === 0 ? <Empty icon={<Wrench />} title={status === 'open' ? 'Всё работает 🎉' : 'Пока пусто'} /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((b) => (
            <Card key={b.id} onClick={() => setSel(b)} className={cx(b.severity === 'critical' && b.status !== 'fixed' && 'border-bad/40')}>
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                <Badge tone={BREAKDOWN_STATUS[b.status].tone}>{BREAKDOWN_STATUS[b.status].label}</Badge>
                {b.status !== 'fixed' && <Badge tone={SEVERITY[b.severity].tone}>{SEVERITY[b.severity].label}</Badge>}
              </div>
              <div className="font-bold text-[16px]">{b.title}</div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[13px] text-muted">
                {b.equipment && <span className="inline-flex items-center gap-1 font-mono font-semibold text-text"><Monitor className="size-3.5" />{b.equipment}</span>}
                {b.zone && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{b.zone}</span>}
                <span>{b.reporter_name} · {timeAgo(b.created_at)}</span>
              </div>
              {b.photos.length > 0 && <div className="mt-3"><PhotoGrid photos={b.photos.slice(0, 4)} size={56} /></div>}
            </Card>
          ))}
        </div>
      )}
      {form && <NewBreakdown onClose={() => setForm(false)} onSaved={reload} />}
      {sel && <BreakdownSheet b={sel} onClose={() => setSel(null)} onSaved={() => { setSel(null); reload(); }} />}
    </div>
  );
}

function NewBreakdown({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const settings = useSettings();
  const [f, setF] = useState({ title: '', equipment: '', zone: '', severity: 'medium', description: '' });
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();
  const save = () => run(async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => fd.append(k, v));
    files.forEach((x) => fd.append('photos', x));
    await api.post('/breakdowns', fd);
    onSaved(); onClose();
  }, 'Поломка зарегистрирована');
  return (
    <Sheet open onClose={onClose} title="Сообщить о поломке" footer={<Button block size="lg" variant="danger" loading={busy} disabled={!f.title.trim()} onClick={save}>Отправить</Button>}>
      <Field label="Что сломалось"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Не работает гарнитура" autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Оборудование / место"><Input value={f.equipment} onChange={(e) => setF({ ...f, equipment: e.target.value })} placeholder="ПК-12" /></Field>
        <Field label="Зона">
          <Select value={f.zone} onChange={(e) => setF({ ...f, zone: e.target.value })}>
            <option value="">—</option>{settings?.zones.map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
      </div>
      <Field group label="Насколько срочно">
        <Segmented value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={[{ value: 'low', label: 'Терпит' }, { value: 'medium', label: 'Средне' }, { value: 'critical', label: 'Критично' }]} />
      </Field>
      <Field label="Описание"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Что происходит, что уже пробовали" /></Field>
      <Field group label="Фото"><PhotoPicker files={files} onChange={setFiles} /></Field>
    </Sheet>
  );
}

function BreakdownSheet({ b, onClose, onSaved }: { b: Breakdown; onClose: () => void; onSaved: () => void }) {
  const [resolution, setResolution] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const { busy, run } = useAction();
  const update = (status: string) => run(async () => {
    const fd = new FormData();
    fd.append('status', status);
    if (resolution) fd.append('resolution', resolution);
    files.forEach((x) => fd.append('photos', x));
    await api.patch(`/breakdowns/${b.id}`, fd);
    onSaved();
  }, status === 'fixed' ? 'Отмечено как исправленное' : 'Статус обновлён');
  return (
    <Sheet open onClose={onClose} title={b.title}>
      <div className="flex flex-wrap gap-1.5">
        <Badge tone={BREAKDOWN_STATUS[b.status].tone}>{BREAKDOWN_STATUS[b.status].label}</Badge>
        <Badge tone={SEVERITY[b.severity].tone}>{SEVERITY[b.severity].label}</Badge>
        {b.equipment && <Badge>{b.equipment}</Badge>}
        {b.zone && <Badge>{b.zone}</Badge>}
      </div>
      {b.description && <p className="whitespace-pre-wrap">{b.description}</p>}
      <PhotoGrid photos={b.photos} size={88} />
      <p className="text-xs text-muted">Сообщил(а) {b.reporter_name} · {dateTime(b.created_at)}</p>
      {b.status === 'fixed' ? (
        <Card className="bg-ok/5 border-ok/30 text-sm">
          <b>Исправлено</b> {b.resolver_name && `· ${b.resolver_name}`} {b.resolved_at && `· ${dateTime(b.resolved_at)}`}
          {b.resolution && <p className="mt-1">{b.resolution}</p>}
        </Card>
      ) : (
        <>
          <Field label="Что сделано"><Textarea value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="Заменили мышь, перезагрузили…" /></Field>
          <Field group label="Фото после ремонта"><PhotoPicker files={files} onChange={setFiles} max={4} /></Field>
          <div className="grid grid-cols-2 gap-2">
            {b.status === 'new' && <Button variant="secondary" icon={<Hammer className="size-4" />} loading={busy} onClick={() => update('in_progress')}>В ремонте</Button>}
            <Button variant="success" className={b.status !== 'new' ? 'col-span-2' : ''} icon={<Check className="size-4" />} loading={busy} onClick={() => update('fixed')}>Исправлено</Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
