import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, Clock, MapPin, Camera, ListChecks, Star } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import type { Task } from '../lib/api';
import { PRIORITY, TASK_STATUS } from '../lib/meta';
import { deadlineLabel, isOverdue } from '../lib/format';
import { Avatar, Badge, Button, Card, Empty, ErrorBox, PageHeader, Segmented, Spinner, cx } from '../components/ui';
import TaskForm from '../components/TaskForm';

type Scope = 'active' | 'review' | 'done';

export function TaskCard({ t, onClick, showAssignee }: { t: Task; onClick: () => void; showAssignee?: boolean }) {
  const overdue = t.status !== 'done' && isOverdue(t.deadline);
  return (
    <Card onClick={onClick} className="relative overflow-hidden pl-5">
      <span className={cx('absolute left-0 top-0 bottom-0 w-1.5', { urgent: 'bg-bad', high: 'bg-warn', normal: 'bg-accent', low: 'bg-surface-3' }[t.priority])} />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
            {t.status !== 'open' && <Badge tone={TASK_STATUS[t.status].tone}>{TASK_STATUS[t.status].label}</Badge>}
            {!t.assignee_id && <Badge tone="info">Общая</Badge>}
          </div>
          <div className="font-bold text-[16px] leading-snug">{t.title}</div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[13px] text-muted">
            {t.deadline && <span className={cx('inline-flex items-center gap-1', overdue && 'text-bad font-semibold')}><Clock className="size-3.5" />{overdue ? 'Просрочено · ' : ''}{deadlineLabel(t.deadline)}</span>}
            {t.zone && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{t.zone}</span>}
            {!!t.photo_required && <span className="inline-flex items-center gap-1"><Camera className="size-3.5" />фото</span>}
            {!!t.points && <span className="inline-flex items-center gap-1 text-ok font-semibold"><Star className="size-3.5" />+{t.points}</span>}
          </div>
        </div>
        {showAssignee && t.assignee_name && <Avatar name={t.assignee_name} size={32} />}
      </div>
    </Card>
  );
}

export default function Tasks() {
  const { isDirector } = useAuth();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const scope = (sp.get('scope') as Scope) || 'active';
  const [mine, setMine] = useState(false);
  const [form, setForm] = useState(false);
  const { data, error, reload } = useApi<Task[]>(`/tasks?scope=${scope}${mine ? '&mine=1' : ''}`);
  const { data: review } = useApi<Task[]>(isDirector ? '/tasks?scope=review' : null, [data]);

  return (
    <div>
      <PageHeader title="Задачи" subtitle={isDirector ? 'Поручения команде и проверка результата' : 'Ваши задачи и общие задачи смены'}
        action={isDirector && <Button icon={<Plus className="size-5" />} onClick={() => setForm(true)}><span className="hidden sm:inline">Новая задача</span><span className="sm:hidden">Создать</span></Button>} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Segmented className="flex-1" value={scope} onChange={(v) => setSp(v === 'active' ? {} : { scope: v })}
          options={[{ value: 'active', label: 'Активные' }, { value: 'review', label: 'На проверке', count: review?.length }, { value: 'done', label: 'Готово' }]} />
        {isDirector && <Segmented value={mine ? 'mine' : 'all'} onChange={(v) => setMine(v === 'mine')} options={[{ value: 'all', label: 'Все' }, { value: 'mine', label: 'Мои' }]} />}
      </div>

      {error ? <ErrorBox error={error} onRetry={reload} /> : !data ? <Spinner /> : data.length === 0 ? (
        <Empty icon={<ListChecks />} title={scope === 'review' ? 'Нечего проверять' : 'Задач нет'} text={scope === 'active' ? 'Новые задачи появятся здесь и в уведомлениях' : undefined} />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((t) => <TaskCard key={t.id} t={t} showAssignee={isDirector} onClick={() => nav(`/tasks/${t.id}`)} />)}
        </div>
      )}
      {form && <TaskForm open onClose={() => setForm(false)} onSaved={reload} />}
    </div>
  );
}
