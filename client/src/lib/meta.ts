import { useEffect, useState } from 'react';
import { api, type Settings } from './api';

export const PRIORITY = {
  urgent: { label: 'Срочно', tone: 'bad' },
  high: { label: 'Высокий', tone: 'warn' },
  normal: { label: 'Обычный', tone: 'accent' },
  low: { label: 'Низкий', tone: 'neutral' },
} as const;

export const TASK_STATUS = {
  open: { label: 'Новая', tone: 'info' },
  in_progress: { label: 'В работе', tone: 'accent' },
  review: { label: 'На проверке', tone: 'warn' },
  done: { label: 'Выполнена', tone: 'ok' },
  rejected: { label: 'На доработке', tone: 'bad' },
} as const;

export const SEVERITY = {
  critical: { label: 'Критическая', tone: 'bad' },
  medium: { label: 'Средняя', tone: 'warn' },
  low: { label: 'Незначительная', tone: 'neutral' },
} as const;

export const BREAKDOWN_STATUS = {
  new: { label: 'Новая', tone: 'bad' },
  in_progress: { label: 'В ремонте', tone: 'warn' },
  fixed: { label: 'Исправлено', tone: 'ok' },
} as const;

export const BOOKING_STATUS = {
  new: { label: 'Новая', tone: 'bad' },
  confirmed: { label: 'Подтверждена', tone: 'ok' },
  done: { label: 'Состоялась', tone: 'neutral' },
  cancelled: { label: 'Отменена', tone: 'neutral' },
} as const;

export const BOOKING_SOURCE: Record<string, string> = { tilda_ru: 'Сайт · RU', tilda_lv: 'Сайт · LV', manual: 'Вручную' };

export const ADVANCE_STATUS = {
  pending: { label: 'Ожидает', tone: 'warn' },
  approved: { label: 'Одобрен', tone: 'accent' },
  paid: { label: 'Выдан', tone: 'ok' },
  rejected: { label: 'Отклонён', tone: 'bad' },
} as const;

export const LEDGER_KIND: Record<string, string> = { task: 'Задача', bonus: 'Бонус', penalty: 'Штраф', exchange: 'Обмен', checklist: 'Чек-лист' };

let cache: Settings | null = null;
let inflight: Promise<Settings> | null = null;
export function useSettings() {
  const [s, setS] = useState<Settings | null>(cache);
  useEffect(() => {
    if (cache) return;
    inflight ||= api.get<Settings>('/settings');
    inflight.then((r) => { cache = r; setS(r); }).catch(() => { inflight = null; });
  }, []);
  return s;
}
export function invalidateSettings() { cache = null; inflight = null; }
