import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api, type Notification } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Button, Card, Empty, PageHeader, Spinner, cx } from '../components/ui';
import { timeAgo } from '../lib/format';

export default function Notifications() {
  const nav = useNavigate();
  const { data, reload } = useApi<{ items: Notification[]; unread: number }>('/notifications');

  const open = async (n: Notification) => {
    if (!n.read) await api.post('/notifications/read', { id: n.id });
    if (n.link) nav(n.link); else reload();
  };

  return (
    <div>
      <PageHeader title="Уведомления" subtitle={data?.unread ? `${data.unread} непрочитанных` : 'Всё прочитано'}
        action={!!data?.unread && <Button size="sm" variant="secondary" icon={<CheckCheck className="size-4" />} onClick={() => api.post('/notifications/read').then(reload)}>Прочитать все</Button>} />
      {!data ? <Spinner /> : data.items.length === 0 ? <Empty icon={<Bell />} title="Пока пусто" text="Здесь появятся новые задачи, брони и решения директора" /> : (
        <Card className="p-1.5">
          {data.items.map((n) => (
            <button key={n.id} onClick={() => open(n)} className="w-full flex gap-3 p-3 rounded-2xl hover:bg-surface-2 text-left transition">
              <span className={cx('mt-1.5 size-2.5 rounded-full shrink-0', n.read ? 'bg-transparent' : 'bg-accent shadow-[0_0_10px_var(--accent)]')} />
              <div className="flex-1 min-w-0">
                <div className={cx('text-[15px]', n.read ? 'text-muted' : 'font-semibold')}>{n.title}</div>
                {n.body && <div className="text-sm text-muted mt-0.5">{n.body}</div>}
                <div className="text-xs text-muted/70 mt-1">{timeAgo(n.created_at)}</div>
              </div>
            </button>
          ))}
        </Card>
      )}
    </div>
  );
}
