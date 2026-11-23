export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'include', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetch(`/api${url}`, init);
  } catch {
    throw new ApiError(0, 'Нет связи с сервером');
  }
  const data = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/')) window.dispatchEvent(new Event('chc:unauthorized'));
    throw new ApiError(res.status, (data as { error?: string })?.error || 'Ошибка запроса');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T = { ok: boolean }>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T = { ok: boolean }>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T = { ok: boolean }>(url: string) => request<T>('DELETE', url),
};

// ——— Типы ———
export type Role = 'director' | 'admin';
export interface User { id: number; name: string; login: string; role: Role; phone?: string; discord_id?: string; sheet_name?: string; active: number; points?: number }
export interface Photo { id: number; url: string; created_at: string }
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'in_progress' | 'review' | 'done' | 'rejected';
export interface Task {
  id: number; title: string; description?: string; zone?: string; priority: Priority; deadline?: string;
  assignee_id?: number; assignee_name?: string; creator_name?: string; status: TaskStatus; points: number;
  photo_required: number; report?: string; review_comment?: string; completed_at?: string; created_at: string; photos: Photo[];
}
export interface Shift { id: number; user_id?: number; employee_name: string; user_name?: string; date: string; start_time: string; end_time: string; note?: string; source: string }
export interface ChecklistItem { item_id: number; title: string; zone?: string; photo_required: number; done: number; note?: string; photos: Photo[] }
export interface ChecklistRun { id: number; user_id: number; user_name?: string; date: string; status: 'in_progress' | 'completed'; comment?: string; completed_at?: string; items: ChecklistItem[]; done_count?: number }
export interface Breakdown {
  id: number; title: string; equipment?: string; zone?: string; description?: string; severity: 'low' | 'medium' | 'critical';
  status: 'new' | 'in_progress' | 'fixed'; reporter_name?: string; resolver_name?: string; resolution?: string; created_at: string; resolved_at?: string; photos: Photo[];
}
export interface Envelope { id: number; name: string; color?: string; balance_cents: number }
export interface EnvelopeTx { id: number; envelope_id: number; envelope_name: string; amount_cents: number; note?: string; user_name?: string; created_at: string }
export interface CashReport {
  id: number; date: string; user_id: number; user_name: string; cash_start_cents: number; cash_revenue_cents: number; card_revenue_cents: number;
  expenses_cents: number; expenses_note?: string; cash_end_cents: number; to_envelope_cents: number; envelope_name?: string; comment?: string;
  status: 'submitted' | 'approved' | 'disputed'; director_comment?: string; expected_cash_cents: number; difference_cents: number; created_at: string;
}
export interface Advance { id: number; user_id: number; user_name: string; amount_cents: number; reason?: string; status: 'pending' | 'approved' | 'rejected' | 'paid'; decided_by_name?: string; decision_comment?: string; created_at: string }
export interface LedgerRow { id: number; delta: number; kind: string; reason?: string; created_by_name?: string; created_at: string }
export interface PointsInfo { user_id: number; balance: number; pending_exchange: number; rate_cents: number; min_exchange: number; ledger: LedgerRow[] }
export interface Exchange { id: number; user_id: number; user_name: string; points: number; amount_cents: number; status: 'pending' | 'approved' | 'rejected'; created_at: string }
export interface Booking {
  id: number; source: string; name?: string; phone?: string; email?: string; date?: string; time?: string; guests?: string; zone?: string;
  comment?: string; raw?: string; status: 'new' | 'confirmed' | 'cancelled' | 'done'; handled_by_name?: string; discord_sent: number; created_at: string;
}
export interface Notification { id: number; title: string; body?: string; link?: string; read: number; created_at: string }
export interface Settings {
  points_rate_cents: string; min_exchange_points: string; checklist_points: string; zones: string[];
  integrations: { discord_bookings: boolean; discord_general: boolean; shifts_sheet: boolean; tilda: boolean };
}
