import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';

/** Как часто открытый экран сам подтягивает свежие данные (решения директора, новые брони и т. п.) */
const LIVE_REFRESH_MS = 15_000;

/**
 * Загрузка данных с API.
 * Обновляется: при открытии экрана, при возврате в приложение и тихо каждые 15 с, пока экран открыт —
 * чтобы директор и администратор видели действия друг друга без перезапуска приложения.
 */
export function useApi<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!url);
  const urlRef = useRef(url);
  urlRef.current = url;

  const inflight = useRef(false);

  const reload = useCallback(async (silent = false) => {
    if (!urlRef.current || inflight.current) return;
    inflight.current = true;
    if (!silent) setLoading(true);
    try {
      setData(await api.get<T>(urlRef.current));
      setError(null);
    } catch (e) {
      if (!silent) setError((e as Error).message); // фоновая ошибка сети не ломает экран
    } finally {
      inflight.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [url, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!url) return;
    const onVis = () => document.visibilityState === 'visible' && reload(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    const t = setInterval(() => document.visibilityState === 'visible' && reload(true), LIVE_REFRESH_MS);
    return () => { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); clearInterval(t); };
  }, [url, reload]);

  return { data, error, loading, reload: () => reload(false), setData };
}
