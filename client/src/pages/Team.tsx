import { useState } from 'react';
import { UserPlus, Shield, Star } from 'lucide-react';
import { api, type User } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, Segmented, Sheet, Spinner, Toggle, cx, useAction } from '../components/ui';

export default function Team() {
  const { data, reload } = useApi<User[]>('/users');
  const [edit, setEdit] = useState<User | 'new' | null>(null);
  return (
    <div>
      <PageHeader title="Команда" subtitle="Аккаунты сотрудников и доступы" action={<Button icon={<UserPlus className="size-5" />} onClick={() => setEdit('new')}>Добавить</Button>} />
      {!data ? <Spinner /> : (
        <div className="grid md:grid-cols-2 gap-3">
          {data.map((u) => (
            <Card key={u.id} onClick={() => setEdit(u)} className={cx('flex items-center gap-3', !u.active && 'opacity-50')}>
              <Avatar name={u.name} size={44} />
              <div className="flex-1 min-w-0">
                <div className="font-bold flex items-center gap-1.5">{u.name}{u.role === 'director' && <Shield className="size-4 text-accent" />}</div>
                <div className="text-xs text-muted">@{u.login}{u.sheet_name && u.sheet_name !== u.name ? ` · в таблице «${u.sheet_name}»` : ''}</div>
              </div>
              {!u.active ? <Badge>Отключён</Badge> : <Badge tone="ok"><Star className="size-3" />{u.points}</Badge>}
            </Card>
          ))}
        </div>
      )}
      {edit && <UserSheet user={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onSaved={reload} />}
    </div>
  );
}

function UserSheet({ user, onClose, onSaved }: { user: User | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: user?.name || '', login: user?.login || '', password: '', role: user?.role || 'admin',
    phone: user?.phone || '', discord_id: user?.discord_id || '', sheet_name: user?.sheet_name || '', active: user ? !!user.active : true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const { busy, run } = useAction();
  const save = () => run(async () => {
    const body = { ...f, active: f.active ? 1 : 0, password: f.password || undefined };
    if (user) await api.patch(`/users/${user.id}`, body); else await api.post('/users', body);
    onSaved(); onClose();
  }, user ? 'Сохранено' : 'Аккаунт создан');
  return (
    <Sheet open onClose={onClose} title={user ? user.name : 'Новый сотрудник'} footer={<Button block size="lg" loading={busy} disabled={!f.name || !f.login || (!user && f.password.length < 6)} onClick={save}>Сохранить</Button>}>
      <Field label="Имя"><Input value={f.name} onChange={set('name')} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Логин"><Input value={f.login} onChange={set('login')} disabled={!!user} autoCapitalize="none" /></Field>
        <Field label={user ? 'Новый пароль' : 'Пароль'}><Input type="text" value={f.password} onChange={set('password')} placeholder={user ? 'не менять' : 'мин. 6 символов'} /></Field>
      </div>
      <Field group label="Роль">
        <Segmented value={f.role} onChange={(v) => setF({ ...f, role: v })} options={[{ value: 'admin', label: 'Администратор' }, { value: 'director', label: 'Директор' }]} />
      </Field>
      <Field label="Имя в Google Таблице смен" hint="Как сотрудник записан в графике — для привязки смен"><Input value={f.sheet_name} onChange={set('sheet_name')} placeholder={f.name} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Телефон"><Input type="tel" value={f.phone} onChange={set('phone')} /></Field>
        <Field label="Discord ID"><Input value={f.discord_id} onChange={set('discord_id')} /></Field>
      </div>
      {user && <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Аккаунт активен" />}
    </Sheet>
  );
}
