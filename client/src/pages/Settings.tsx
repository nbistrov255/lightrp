import { useEffect, useState } from 'react';
import { LogOut, Sun, Moon, Monitor, Smartphone, KeyRound, Plus, Trash2, Camera, CheckCircle2, XCircle, Send } from 'lucide-react';
import { api, type Settings as S } from '../lib/api';
import { useApi } from '../lib/hooks';
import { useAuth } from '../lib/auth';
import { invalidateSettings } from '../lib/meta';
import { Button, Card, Field, Input, PageHeader, SectionTitle, Segmented, Sheet, Spinner, Toggle, cx, useAction } from '../components/ui';

export default function SettingsPage() {
  const { user, isDirector, logout } = useAuth();
  const [pw, setPw] = useState(false);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Настройки" />
      <SectionTitle>Внешний вид</SectionTitle>
      <Card><ThemeSwitch /></Card>
      <InstallCard />
      <SectionTitle>Аккаунт</SectionTitle>
      <Card className="p-1.5">
        <div className="p-3 text-sm"><span className="text-muted">Вход как </span><b>{user?.name}</b> <span className="text-muted">(@{user?.login})</span></div>
        <button onClick={() => setPw(true)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-surface-2 font-semibold"><KeyRound className="size-5 text-muted" />Сменить пароль</button>
        <button onClick={logout} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-bad/10 text-bad font-semibold"><LogOut className="size-5" />Выйти</button>
      </Card>
      {isDirector && <DirectorSettings />}
      {pw && <PasswordSheet onClose={() => setPw(false)} />}
    </div>
  );
}

function ThemeSwitch() {
  const [t, setT] = useState<'system' | 'light' | 'dark'>(() => {
    try { return (localStorage.getItem('chc-theme') as 'light' | 'dark') || 'system'; } catch { return 'system'; }
  });
  useEffect(() => {
    if (t === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { if (t === 'system') localStorage.removeItem('chc-theme'); else localStorage.setItem('chc-theme', t); } catch { /* */ }
  }, [t]);
  return <Segmented value={t} onChange={setT} options={[
    { value: 'dark', label: <><Moon className="size-4" />Тёмная</> }, { value: 'light', label: <><Sun className="size-4" />Светлая</> }, { value: 'system', label: <><Monitor className="size-4" />Авто</> },
  ]} />;
}

function InstallCard() {
  const [prompt, setPrompt] = useState<(Event & { prompt: () => void }) | null>(null);
  const standalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setPrompt(e as Event & { prompt: () => void }); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);
  if (standalone) return null;
  const ios = /iphone|ipad/i.test(navigator.userAgent);
  return (
    <>
      <SectionTitle>Приложение на телефон</SectionTitle>
      <Card className="flex items-start gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-accent/12 text-accent shrink-0"><Smartphone className="size-5" /></span>
        <div className="flex-1 text-sm">
          <div className="font-bold text-[15px]">Установить CyberHub Control</div>
          <p className="text-muted mt-0.5">{ios ? 'В Safari нажмите «Поделиться» → «На экран “Домой”».' : 'Иконка на главном экране, полноэкранный режим, быстрый запуск.'}</p>
          {prompt && <Button size="sm" className="mt-3" onClick={() => prompt.prompt()}>Установить</Button>}
        </div>
      </Card>
    </>
  );
}

function PasswordSheet({ onClose }: { onClose: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const { busy, run } = useAction();
  return (
    <Sheet open onClose={onClose} title="Смена пароля" footer={<Button block size="lg" loading={busy} disabled={!current || next.length < 6} onClick={() => run(async () => { await api.post('/auth/password', { current, next }); onClose(); }, 'Пароль изменён')}>Сохранить</Button>}>
      <Field label="Текущий пароль"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
      <Field label="Новый пароль" hint="Минимум 6 символов"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
    </Sheet>
  );
}

function DirectorSettings() {
  const { data: s, reload } = useApi<S>('/settings');
  const { data: items, reload: reloadItems } = useApi<{ id: number; title: string; zone?: string; photo_required: number }[]>('/checklist/items');
  const [f, setF] = useState<{ rate: string; min: string; ck: string; zones: string } | null>(null);
  const [newItem, setNewItem] = useState({ title: '', photo: true });
  const { busy, run } = useAction();

  useEffect(() => {
    if (s) setF({ rate: (Number(s.points_rate_cents) / 100).toString(), min: s.min_exchange_points, ck: s.checklist_points, zones: s.zones.join(', ') });
  }, [s]);
  if (!s || !f) return <Spinner />;

  const save = () => run(async () => {
    await api.patch('/settings', {
      points_rate_cents: Math.round(Number(f.rate.replace(',', '.')) * 100), min_exchange_points: f.min, checklist_points: f.ck,
      zones: f.zones.split(',').map((z) => z.trim()).filter(Boolean),
    });
    invalidateSettings(); reload();
  }, 'Настройки сохранены');

  const Status = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className="flex items-center gap-2.5 py-1.5 text-sm">
      {ok ? <CheckCircle2 className="size-5 text-ok" /> : <XCircle className="size-5 text-muted" />}
      <span className={cx(!ok && 'text-muted')}>{label}</span>
    </div>
  );

  return (
    <>
      <SectionTitle>Интеграции</SectionTitle>
      <Card>
        <Status ok={s.integrations.tilda} label="Приём броней с Tilda (TILDA_TOKEN)" />
        <Status ok={s.integrations.discord_bookings} label="Discord: канал броней" />
        <Status ok={s.integrations.discord_general} label="Discord: общий канал (поломки, касса, авансы)" />
        <Status ok={s.integrations.shifts_sheet} label="Google Таблица смен" />
        <p className="text-xs text-muted mt-2">Ключи задаются в файле .env на сервере — см. README.</p>
        {(s.integrations.discord_bookings || s.integrations.discord_general) && (
          <Button size="sm" variant="secondary" className="mt-3" icon={<Send className="size-4" />} loading={busy}
            onClick={() => run(() => api.post('/settings/discord-test'), 'Тестовые сообщения отправлены')}>Проверить Discord</Button>
        )}
      </Card>

      <SectionTitle>Баллы</SectionTitle>
      <Card className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Field label="1 балл = €"><Input inputMode="decimal" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} /></Field>
          <Field label="Мин. обмен"><Input inputMode="numeric" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} /></Field>
          <Field label="За чек-лист"><Input inputMode="numeric" value={f.ck} onChange={(e) => setF({ ...f, ck: e.target.value })} /></Field>
        </div>
        <Field label="Зоны клуба" hint="Через запятую"><Input value={f.zones} onChange={(e) => setF({ ...f, zones: e.target.value })} /></Field>
        <Button loading={busy} onClick={save}>Сохранить</Button>
      </Card>

      <SectionTitle>Пункты чек-листа смены</SectionTitle>
      <Card className="p-1.5">
        {items?.map((i) => (
          <div key={i.id} className="flex items-center gap-3 p-2.5">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{i.title}</div>
              <div className="text-xs text-muted flex items-center gap-2">{i.zone}{!!i.photo_required && <span className="inline-flex items-center gap-1"><Camera className="size-3" />фото</span>}</div>
            </div>
            <button onClick={() => run(async () => { await api.patch(`/checklist/items/${i.id}`, { photo_required: !i.photo_required }); reloadItems(); })} className={cx('grid size-9 place-items-center rounded-xl', i.photo_required ? 'text-accent bg-accent/10' : 'text-muted bg-surface-2')} title="Фото обязательно"><Camera className="size-4" /></button>
            <button onClick={() => confirm('Удалить пункт?') && run(async () => { await api.del(`/checklist/items/${i.id}`); reloadItems(); })} className="grid size-9 place-items-center rounded-xl text-muted hover:text-bad bg-surface-2"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <div className="p-2.5 space-y-2 border-t border-line mt-1">
          <Input value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} placeholder="Новый пункт…" />
          <div className="flex items-center gap-3">
            <div className="flex-1"><Toggle checked={newItem.photo} onChange={(v) => setNewItem({ ...newItem, photo: v })} label={<span className="text-sm">Нужно фото</span>} /></div>
            <Button size="sm" icon={<Plus className="size-4" />} disabled={!newItem.title.trim()} onClick={() => run(async () => { await api.post('/checklist/items', { title: newItem.title, photo_required: newItem.photo }); setNewItem({ title: '', photo: true }); reloadItems(); })}>Добавить</Button>
          </div>
        </div>
      </Card>
    </>
  );
}
