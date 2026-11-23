import { createContext, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Camera, Loader2, X, ImagePlus, CheckCircle2, AlertTriangle } from 'lucide-react';
import { compressImage } from '../lib/image';
import { initials } from '../lib/format';
import type { Photo } from '../lib/api';

export const cx = (...c: (string | number | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ——— Кнопки ———
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' | 'lg'; icon?: ReactNode; block?: boolean }
export function Button({ variant = 'primary', loading, size = 'md', icon, block, className, children, disabled, ...p }: BtnProps) {
  const v = {
    primary: 'btn-accent text-white',
    secondary: 'bg-surface-2 text-text border border-line hover:bg-surface-3',
    ghost: 'text-muted hover:text-text hover:bg-surface-2',
    danger: 'bg-bad/12 text-bad border border-bad/25 hover:bg-bad/20',
    success: 'bg-ok/12 text-ok border border-ok/25 hover:bg-ok/20',
  }[variant];
  const s = { sm: 'h-9 px-3 text-sm rounded-xl gap-1.5', md: 'h-11 px-4 text-[15px] rounded-2xl gap-2', lg: 'h-13 px-5 text-base rounded-2xl gap-2' }[size];
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={cx('inline-flex items-center justify-center font-semibold transition active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap', v, s, block && 'w-full', className)}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ className, children, badge, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { badge?: number }) {
  return (
    <button {...p} className={cx('relative inline-flex size-10 items-center justify-center rounded-2xl text-muted hover:text-text hover:bg-surface-2 transition active:scale-95', className)}>
      {children}
      {!!badge && <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-bad text-white text-[11px] font-bold grid place-items-center ring-2 ring-bg">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

// ——— Карточки ———
export function Card({ className, children, onClick, glow }: { className?: string; children: ReactNode; onClick?: () => void; glow?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        'rounded-3xl bg-surface border border-line p-4',
        onClick && 'cursor-pointer transition hover:border-accent/40 active:scale-[.99]',
        glow && 'shadow-[0_0_0_1px_var(--accent),0_10px_40px_-12px_var(--glow)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mt-6 mb-2.5 px-1">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted">{children}</h2>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-[26px] md:text-3xl font-extrabold tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-muted text-sm mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'bad' | 'info';
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  const t = {
    neutral: 'bg-surface-3 text-muted',
    accent: 'bg-accent/15 text-accent',
    ok: 'bg-ok/15 text-ok',
    warn: 'bg-warn/15 text-warn',
    bad: 'bg-bad/15 text-bad',
    info: 'bg-accent-2/15 text-accent-2',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap', t, className)}>{children}</span>;
}

export function Avatar({ name, size = 36 }: { name?: string; size?: number }) {
  const hue = [...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <span
      className="inline-grid place-items-center rounded-full font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 50) % 360} 70% 48%))` }}
    >
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, hint, icon, tone = 'accent', onClick }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: Tone; onClick?: () => void }) {
  const t = { accent: 'text-accent bg-accent/12', ok: 'text-ok bg-ok/12', warn: 'text-warn bg-warn/12', bad: 'text-bad bg-bad/12', info: 'text-accent-2 bg-accent-2/12', neutral: 'text-muted bg-surface-3' }[tone];
  return (
    <Card onClick={onClick} className="p-3.5">
      <div className="flex items-center gap-2.5">
        {icon && <span className={cx('grid size-9 place-items-center rounded-2xl', t)}>{icon}</span>}
        <span className="text-[13px] text-muted font-medium leading-tight">{label}</span>
      </div>
      <div className="mt-2.5 text-2xl font-extrabold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}
    </Card>
  );
}

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      {icon && <div className="grid size-14 place-items-center rounded-3xl bg-surface-2 text-muted mb-3">{icon}</div>}
      <div className="font-bold">{title}</div>
      {text && <div className="text-sm text-muted mt-1 max-w-xs">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <div className={cx('flex justify-center py-10', className)}><Loader2 className="size-6 animate-spin text-accent" /></div>;
}

export function ErrorBox({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <Card className="border-bad/30 bg-bad/5 flex items-center gap-3">
      <AlertTriangle className="size-5 text-bad shrink-0" />
      <div className="text-sm flex-1">{error}</div>
      {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Повторить</Button>}
    </Card>
  );
}

// ——— Сегменты / вкладки ———
export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={cx('flex gap-1 p-1 rounded-2xl bg-surface-2 border border-line overflow-x-auto no-scrollbar', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx('flex-1 h-9 px-3 rounded-xl text-sm font-semibold transition whitespace-nowrap inline-flex items-center justify-center gap-1.5',
            value === o.value ? 'bg-surface text-text shadow-sm border border-line' : 'text-muted hover:text-text')}
        >
          {o.label}
          {!!o.count && <span className={cx('min-w-5 h-5 px-1.5 rounded-full text-[11px] grid place-items-center', value === o.value ? 'bg-accent text-white' : 'bg-surface-3')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ——— Формы ———
export function Field({ label, hint, children, className, group }: { label?: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; group?: boolean }) {
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cx('block', className)}>
      {label && <span className="block text-[13px] font-semibold text-muted mb-1.5 px-0.5">{label}</span>}
      {children}
      {hint && <span className="block text-xs text-muted mt-1 px-0.5">{hint}</span>}
    </Tag>
  );
}
const inputCls = 'w-full rounded-2xl bg-surface-2 border border-line px-3.5 h-11 text-[15px] outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 placeholder:text-muted/60';
export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(inputCls, className)} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={cx(inputCls, 'h-auto py-2.5 resize-none', className)} />;
export const Select = ({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select {...p} className={cx(inputCls, 'appearance-none pr-9 bg-[url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2716%27 height=%2716%27 fill=%27none%27 stroke=%27%238d8daa%27 stroke-width=%272%27%3E%3Cpath d=%27M4 6l4 4 4-4%27/%3E%3C/svg%3E")] bg-no-repeat bg-[right_12px_center]', className)}>{children}</select>
);
export function MoneyInput(p: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <Input inputMode="decimal" placeholder="0" {...p} className="pr-9 font-mono tabular-nums" />
      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted font-semibold">€</span>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center justify-between w-full gap-3 py-1 text-left">
      <span className="text-[15px]">{label}</span>
      <span className={cx('relative h-7 w-12 rounded-full transition shrink-0', checked ? 'bg-accent' : 'bg-surface-3')}>
        <span className={cx('absolute top-0.5 size-6 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
      </span>
    </button>
  );
}

// ——— Нижняя шторка (мобильный) / диалог (десктоп) ———
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div className="relative w-full md:max-w-lg max-h-[92dvh] flex flex-col bg-surface border border-line rounded-t-[28px] md:rounded-[28px] anim-sheet shadow-2xl">
        <div className="md:hidden mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-surface-3" />
        <div className="flex items-center justify-between px-5 pt-3 md:pt-5 pb-2">
          <h3 className="text-lg font-bold">{title}</h3>
          <IconButton onClick={onClose} aria-label="Закрыть"><X className="size-5" /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 pb-5 space-y-4">{children}</div>
        {footer && <div className="px-5 pt-3 pb-5 border-t border-line pb-safe">{footer}</div>}
      </div>
    </div>
  );
}

// ——— Фото ———
export function PhotoPicker({ files, onChange, max = 6, label = 'Добавить фото' }: { files: File[]; onChange: (f: File[]) => void; max?: number; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    return () => u.forEach(URL.revokeObjectURL);
  }, [files]);

  const pick = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const compressed = await Promise.all([...list].slice(0, max - files.length).map((f) => compressImage(f)));
    onChange([...files, ...compressed]);
    setBusy(false);
    if (ref.current) ref.current.value = '';
  };

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((u, i) => (
        <div key={u} className="relative size-20 rounded-2xl overflow-hidden border border-line">
          <img src={u} className="size-full object-cover" alt="" />
          <button type="button" onClick={() => onChange(files.filter((_, j) => j !== i))} className="absolute top-1 right-1 size-6 grid place-items-center rounded-full bg-black/70 text-white"><X className="size-3.5" /></button>
        </div>
      ))}
      {files.length < max && (
        <button type="button" onClick={() => ref.current?.click()} className="size-20 rounded-2xl border-2 border-dashed border-line text-muted hover:text-accent hover:border-accent/50 grid place-items-center transition">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <div className="flex flex-col items-center gap-1"><Camera className="size-5" /><span className="text-[10px] font-semibold leading-none">{label}</span></div>}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" multiple capture="environment" hidden onChange={(e) => pick(e.target.files)} />
    </div>
  );
}

/** Мини-кнопка «сфотографировать» для пунктов чек-листа */
export function QuickPhoto({ onFiles, busy }: { onFiles: (f: File[]) => void; busy?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={(e) => { e.stopPropagation(); ref.current?.click(); }} className="grid size-10 place-items-center rounded-2xl bg-surface-2 border border-line text-muted hover:text-accent shrink-0">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
      </button>
      <input ref={ref} type="file" accept="image/*" capture="environment" hidden onChange={async (e) => {
        const f = e.target.files;
        if (f?.length) onFiles(await Promise.all([...f].map((x) => compressImage(x))));
        e.target.value = '';
      }} />
    </>
  );
}

export function PhotoGrid({ photos, size = 72 }: { photos: Photo[]; size?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!photos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <button key={p.id} type="button" onClick={(e) => { e.stopPropagation(); setOpen(p.url); }} className="rounded-2xl overflow-hidden border border-line" style={{ width: size, height: size }}>
            <img src={p.url} loading="lazy" className="size-full object-cover" alt="" />
          </button>
        ))}
      </div>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4 anim-fade" onClick={() => setOpen(null)}>
          <img src={open} className="max-h-full max-w-full rounded-2xl" alt="" />
          <button className="absolute top-4 right-4 pt-safe size-10 grid place-items-center rounded-full bg-white/10 text-white"><X /></button>
        </div>
      )}
    </>
  );
}

// ——— Тосты ———
interface ToastItem { id: number; text: string; tone: 'ok' | 'bad' }
const ToastCtx = createContext<(text: string, tone?: 'ok' | 'bad') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = (text: string, tone: 'ok' | 'bad' = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[70] left-1/2 -translate-x-1/2 top-3 pt-safe flex flex-col gap-2 w-[calc(100%-32px)] max-w-sm pointer-events-none">
        {items.map((t) => (
          <div key={t.id} className="anim-sheet flex items-center gap-2.5 rounded-2xl bg-surface border border-line px-4 py-3 shadow-2xl text-sm font-medium">
            {t.tone === 'ok' ? <CheckCircle2 className="size-5 text-ok shrink-0" /> : <AlertTriangle className="size-5 text-bad shrink-0" />}
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/** Обёртка для действий: показывает ошибку тостом */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    try {
      await fn();
      if (success) toast(success);
      return true;
    } catch (e) {
      toast((e as Error).message, 'bad');
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
