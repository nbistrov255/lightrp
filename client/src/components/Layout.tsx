import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Home, ListChecks, CalendarClock, Wallet, Menu, CalendarDays, ClipboardCheck, Wrench, Coins, Users, Settings, Bell, LogOut,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { api } from '../lib/api';
import { Avatar, IconButton, cx } from './ui';

export const NAV = [
  { to: '/', label: 'Главная', icon: Home, end: true },
  { to: '/tasks', label: 'Задачи', icon: ListChecks },
  { to: '/bookings', label: 'Брони', icon: CalendarClock },
  { to: '/checklist', label: 'Чек-лист смены', short: 'Чек-лист', icon: ClipboardCheck },
  { to: '/shifts', label: 'Смены', icon: CalendarDays },
  { to: '/breakdowns', label: 'Поломки', icon: Wrench },
  { to: '/cash', label: 'Касса', icon: Wallet },
  { to: '/money', label: 'Баллы и авансы', icon: Coins },
  { to: '/team', label: 'Команда', icon: Users, director: true },
  { to: '/settings', label: 'Настройки', icon: Settings },
];

const MOBILE_TABS = ['/', '/tasks', '/bookings', '/cash'];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/icon.svg" className="size-9 rounded-xl" alt="" />
      <div className="leading-none">
        <div className="font-extrabold tracking-tight text-[17px]">CyberHub</div>
        <div className="text-[11px] font-bold uppercase tracking-[.2em] text-gradient mt-0.5">Control</div>
      </div>
    </div>
  );
}

function useUnread() {
  const [n, setN] = useState(0);
  const loc = useLocation();
  useEffect(() => {
    let alive = true;
    const load = () => api.get<{ unread: number }>('/notifications').then((r) => alive && setN(r.unread)).catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, [loc.pathname]);
  return n;
}

export default function Layout() {
  const { user, isDirector, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const unread = useUnread();
  const items = NAV.filter((i) => !i.director || isDirector);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh bg-hero md:flex">
      {/* Десктоп: боковая панель */}
      <aside className="hidden md:flex w-64 lg:w-72 shrink-0 flex-col border-r border-line bg-surface/60 backdrop-blur-xl sticky top-0 h-dvh p-4">
        <div className="px-2 py-2"><Logo /></div>
        <nav className="mt-6 flex-1 space-y-1 overflow-y-auto">
          {items.map((i) => (
            <NavLink
              key={i.to} to={i.to} end={i.end}
              className={({ isActive }) => cx('flex items-center gap-3 h-11 px-3 rounded-2xl text-[15px] font-semibold transition',
                isActive ? 'bg-accent/12 text-accent' : 'text-muted hover:text-text hover:bg-surface-2')}
            >
              <i.icon className="size-5" />{i.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-3 p-2 rounded-2xl bg-surface-2 border border-line">
          <Avatar name={user?.name} />
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate text-sm">{user?.name}</div>
            <div className="text-xs text-muted">{isDirector ? 'Директор' : 'Администратор'}</div>
          </div>
          <IconButton onClick={() => nav('/notifications')} badge={unread} aria-label="Уведомления"><Bell className="size-5" /></IconButton>
          <IconButton onClick={logout} aria-label="Выйти"><LogOut className="size-5" /></IconButton>
        </div>
      </aside>

      <div className="flex-1 min-w-0">
        {/* Мобильная верхняя панель */}
        <header className="md:hidden sticky top-0 z-30 pt-safe bg-bg/75 backdrop-blur-xl border-b border-line/60">
          <div className="flex items-center justify-between h-14 px-4">
            <Logo />
            <div className="flex items-center gap-1">
              <IconButton onClick={() => nav('/notifications')} badge={unread} aria-label="Уведомления"><Bell className="size-5" /></IconButton>
              <button onClick={() => nav('/settings')} className="ml-1"><Avatar name={user?.name} size={34} /></button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 md:px-8 pt-4 md:pt-8 pb-28 md:pb-12">
          <Outlet />
        </main>

        {/* Мобильная нижняя навигация */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/85 backdrop-blur-xl border-t border-line pb-safe">
          <div className="grid grid-cols-5 h-16">
            {MOBILE_TABS.map((to) => {
              const i = NAV.find((n) => n.to === to)!;
              return (
                <NavLink key={to} to={to} end={i.end} className={({ isActive }) => cx('flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', isActive ? 'text-accent' : 'text-muted')}>
                  {({ isActive }) => (
                    <>
                      <span className={cx('grid h-8 w-14 place-items-center rounded-full transition', isActive && 'bg-accent/15')}><i.icon className="size-[22px]" /></span>
                      {i.short || i.label}
                    </>
                  )}
                </NavLink>
              );
            })}
            <NavLink to="/more" className={({ isActive }) => cx('flex flex-col items-center justify-center gap-1 text-[11px] font-semibold', isActive ? 'text-accent' : 'text-muted')}>
              {({ isActive }) => (<><span className={cx('grid h-8 w-14 place-items-center rounded-full', isActive && 'bg-accent/15')}><Menu className="size-[22px]" /></span>Ещё</>)}
            </NavLink>
          </div>
        </nav>
      </div>
    </div>
  );
}
