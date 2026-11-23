import { useState } from 'react';
import { api, type Task, type User } from '../lib/api';
import { useApi } from '../lib/hooks';
import { PRIORITY, useSettings } from '../lib/meta';
import { Button, Field, Input, Select, Sheet, Textarea, Toggle, cx, useAction } from './ui';

export default function TaskForm({ open, onClose, onSaved, task }: { open: boolean; onClose: () => void; onSaved: () => void; task?: Task }) {
  const settings = useSettings();
  const { data: users } = useApi<User[]>(open ? '/users' : null);
  const [f, setF] = useState(() => ({
    title: task?.title || '', description: task?.description || '', zone: task?.zone || '', priority: task?.priority || 'normal',
    deadline: task?.deadline || '', assignee_id: task?.assignee_id ? String(task.assignee_id) : '', points: String(task?.points ?? 10),
    photo_required: task ? !!task.photo_required : true,
  }));
  const set = (k: keyof typeof f) => (v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const { busy, run } = useAction();

  const save = () => run(async () => {
    const body = { ...f, assignee_id: f.assignee_id ? Number(f.assignee_id) : null, points: Number(f.points) || 0 };
    if (task) await api.patch(`/tasks/${task.id}`, body); else await api.post('/tasks', body);
    onSaved();
    onClose();
  }, task ? 'Задача обновлена' : 'Задача создана');

  return (
    <Sheet open={open} onClose={onClose} title={task ? 'Редактировать задачу' : 'Новая задача'}
      footer={<Button block size="lg" loading={busy} disabled={!f.title.trim()} onClick={save}>{task ? 'Сохранить' : 'Создать задачу'}</Button>}>
      <Field label="Что нужно сделать"><Input value={f.title} onChange={(e) => set('title')(e.target.value)} placeholder="Например: почистить кулеры в VIP" autoFocus /></Field>
      <Field label="Описание"><Textarea value={f.description} onChange={(e) => set('description')(e.target.value)} placeholder="Детали, критерии готовности" /></Field>
      <Field group label="Приоритет">
        <div className="grid grid-cols-4 gap-1.5">
          {(Object.keys(PRIORITY) as (keyof typeof PRIORITY)[]).reverse().map((p) => (
            <button key={p} type="button" onClick={() => set('priority')(p)}
              className={cx('h-10 rounded-xl text-sm font-semibold border transition', f.priority === p
                ? { urgent: 'bg-bad text-white border-bad', high: 'bg-warn text-black border-warn', normal: 'bg-accent text-white border-accent', low: 'bg-surface-3 border-line' }[p]
                : 'bg-surface-2 border-line text-muted')}>{PRIORITY[p].label}</button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Зона">
          <Select value={f.zone} onChange={(e) => set('zone')(e.target.value)}>
            <option value="">Не указана</option>
            {settings?.zones.map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
        <Field label="Баллы за выполнение"><Input type="number" inputMode="numeric" value={f.points} onChange={(e) => set('points')(e.target.value)} /></Field>
      </div>
      <Field label="Исполнитель">
        <Select value={f.assignee_id} onChange={(e) => set('assignee_id')(e.target.value)}>
          <option value="">Любой администратор (общая)</option>
          {users?.filter((u) => u.active).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Дедлайн"><Input type="datetime-local" value={f.deadline} onChange={(e) => set('deadline')(e.target.value)} /></Field>
      <Toggle checked={f.photo_required} onChange={set('photo_required')} label="Фотоотчёт обязателен" />
    </Sheet>
  );
}
