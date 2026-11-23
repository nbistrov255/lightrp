import { NavLink } from 'react-router-dom';
import { ChevronRight, Bell } from 'lucide-react';
import { NAV } from '../components/Layout';
import { useAuth } from '../lib/auth';
import { Avatar, Card } from '../components/ui';

export default function More() {
  const { user, isDirector } = useAuth();
  const items = [...NAV.filter((i) => i.to !== '/' && (!i.director || isDirector)), { to: '/notifications', label: 'Уведомления', icon: Bell }];
  return (
    <div>
      <Card className="flex items-center gap-3 mb-4">
        <Avatar name={user?.name} size={48} />
        <div>
          <div className="font-bold text-lg">{user?.name}</div>
          <div className="text-sm text-muted">{isDirector ? 'Директор' : 'Администратор'} · @{user?.login}</div>
        </div>
      </Card>
      <Card className="p-1.5">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className="flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-2 transition">
            <span className="grid size-10 place-items-center rounded-2xl bg-accent/12 text-accent"><i.icon className="size-5" /></span>
            <span className="flex-1 font-semibold">{i.label}</span>
            <ChevronRight className="size-5 text-muted" />
          </NavLink>
        ))}
      </Card>
    </div>
  );
}
