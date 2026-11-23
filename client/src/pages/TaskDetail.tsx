import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Star, User, Play, Send, Check, RotateCcw, Pencil, Trash2, Camera } from 'lucide-react';
import { api, type Task } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { PRIORITY, TASK_STATUS } from '../lib/meta';
import { dateTime, deadlineLabel, isOverdue } from '../lib/format';
import { Badge, Button, Card, ErrorBox, Field, IconButton, Input, PhotoGrid, PhotoPicker, SectionTitle, Spinner, Textarea, cx, useAction } from '../components/ui';
import TaskForm from '../components/TaskForm';

export default function TaskDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, isDirector } = useAuth();
  const { data: t, error, reload } = useApi<Task>(`/tasks/${id}`);
  const [files, setFiles] = useState<File[]>([]);
  const [report, setReport] = useState('');
  const [comment, setComment] = useState('');
  const [points, setPoints] = useState('');
  const [edit, setEdit] = useState(false);
  const { busy, run } = useAction();

  if (error) return <ErrorBox error={error} onRetry={reload} />;
  if (!t) return <Spinner />;

  const canWork = !t.assignee_id || t.assignee_id === user?.id;
  const working = ['open', 'in_progress', 'rejected'].includes(t.status);

  const submit = () => run(async () => {
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    fd.append('report', report);
    await api.post(`/tasks/${t.id}/submit`, fd);
    setFiles([]); reload();
  }, 'Отправлено на проверку');

  const review = (approve: boolean) => run(async () => {
    await api.post(`/tasks/${t.id}/review`, { approve, comment, points: points === '' ? undefined : Number(points) });
    reload();
  }, approve ? 'Задача принята' : 'Возвращено на доработку');

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-3 -ml-2">
        <Button variant="ghost" size="sm" icon={<ArrowLeft className="size-4" />} onClick={() => nav(-1)}>Назад</Button>
        {isDirector && (
          <div className="flex gap-1">
            <IconButton onClick={() => setEdit(true)} aria-label="Редактировать"><Pencil className="size-4" /></IconButton>
            <IconButton onClick={() => confirm('Удалить задачу?') && run(async () => { await api.del(`/tasks/${t.id}`); nav('/tasks'); }, 'Удалено')} aria-label="Удалить"><Trash2 className="size-4" /></IconButton>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
        <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>
      </div>
      <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{t.title}</h1>

      <Card className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <Info icon={<Clock className="size-4" />} label="Дедлайн" value={t.deadline ? deadlineLabel(t.deadline) : 'Без срока'} bad={t.status !== 'done' && isOverdue(t.deadline)} />
        <Info icon={<MapPin className="size-4" />} label="Зона" value={t.zone || '—'} />
        <Info icon={<User className="size-4" />} label="Исполнитель" value={t.assignee_name || 'Любой администратор'} />
        <Info icon={<Star className="size-4" />} label="Баллы" value={t.points ? `+${t.points}` : '—'} />
      </Card>

      {t.description && <Card className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{t.description}</Card>}

      {t.review_comment && (
        <Card className={cx('mt-3', t.status === 'rejected' ? 'border-bad/30 bg-bad/5' : 'border-ok/30 bg-ok/5')}>
          <div className="text-xs font-bold uppercase tracking-wider text-muted mb-1">Комментарий директора</div>
          {t.review_comment}
        </Card>
      )}

      {(t.photos.length > 0 || t.report) && (
        <>
          <SectionTitle>Отчёт исполнителя</SectionTitle>
          <Card className="space-y-3">
            {t.report && <p className="whitespace-pre-wrap">{t.report}</p>}
            <PhotoGrid photos={t.photos} size={96} />
            {t.completed_at && <div className="text-xs text-muted">Сдано {dateTime(t.completed_at)}</div>}
          </Card>
        </>
      )}

      {/* Исполнитель */}
      {working && canWork && (
        <>
          <SectionTitle>{t.status === 'rejected' ? 'Доработать и сдать снова' : 'Выполнение'}</SectionTitle>
          <Card className="space-y-4">
            {t.status === 'open' && <Button block variant="secondary" icon={<Play className="size-4" />} loading={busy} onClick={() => run(async () => { await api.post(`/tasks/${t.id}/start`); reload(); }, 'Задача взята в работу')}>Взять в работу</Button>}
            <Field group label={<span className="inline-flex items-center gap-1.5"><Camera className="size-4" />Фото результата{t.photo_required ? ' (обязательно)' : ''}</span>}>
              <PhotoPicker files={files} onChange={setFiles} />
            </Field>
            <Field label="Комментарий"><Textarea value={report} onChange={(e) => setReport(e.target.value)} placeholder="Что сделано, нюансы" /></Field>
            <Button block size="lg" icon={<Send className="size-4" />} loading={busy} disabled={!!t.photo_required && !files.length && !t.photos.length} onClick={submit}>Сдать на проверку</Button>
          </Card>
        </>
      )}

      {/* Директор: проверка */}
      {isDirector && t.status === 'review' && (
        <>
          <SectionTitle>Проверка</SectionTitle>
          <Card className="space-y-4">
            <Field label="Комментарий"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что хорошо / что исправить" /></Field>
            <Field label="Начислить баллов" hint={`По умолчанию — ${t.points}`}><Input type="number" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} placeholder={String(t.points)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" icon={<RotateCcw className="size-4" />} loading={busy} onClick={() => review(false)}>На доработку</Button>
              <Button variant="success" icon={<Check className="size-4" />} loading={busy} onClick={() => review(true)}>Принять</Button>
            </div>
          </Card>
        </>
      )}

      <p className="text-xs text-muted mt-6">Создал(а) {t.creator_name || '—'} · {dateTime(t.created_at)}</p>
      {edit && <TaskForm open task={t} onClose={() => setEdit(false)} onSaved={reload} />}
    </div>
  );
}

function Info({ icon, label, value, bad }: { icon: React.ReactNode; label: string; value: string; bad?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted text-xs font-semibold mb-0.5">{icon}{label}</div>
      <div className={cx('font-semibold', bad && 'text-bad')}>{value}</div>
    </div>
  );
}
