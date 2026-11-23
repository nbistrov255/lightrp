import { useState, type FormEvent } from 'react';
import { LogIn } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { Button, Field, Input } from '../components/ui';

export default function Login() {
  const { login } = useAuth();
  const [l, setL] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try { await login(l, p); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-dvh bg-hero flex flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <img src="/icon.svg" className="size-20 rounded-[26px] shadow-[0_20px_60px_-15px_var(--glow)]" alt="" />
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight">CyberHub <span className="text-gradient">Control</span></h1>
          <p className="text-muted mt-1.5 text-sm">Смены, задачи, касса и брони клуба</p>
        </div>
        <form onSubmit={submit} className="rounded-[28px] bg-surface/80 backdrop-blur-xl border border-line p-5 space-y-4 shadow-2xl">
          <Field label="Логин">
            <Input value={l} onChange={(e) => setL(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus required />
          </Field>
          <Field label="Пароль">
            <Input type="password" value={p} onChange={(e) => setP(e.target.value)} autoComplete="current-password" required />
          </Field>
          {err && <div className="text-sm text-bad bg-bad/10 border border-bad/20 rounded-2xl px-3.5 py-2.5">{err}</div>}
          <Button type="submit" block size="lg" loading={busy} icon={<LogIn className="size-5" />}>Войти</Button>
        </form>
        <p className="text-center text-xs text-muted mt-6">Аккаунты создаёт директор. Забыли пароль — обратитесь к директору.</p>
      </div>
    </div>
  );
}
