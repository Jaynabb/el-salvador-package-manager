import { useState, useRef, useEffect } from 'react';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  durationMs: number;
}

export interface ToastApi {
  toasts: Toast[];
  dismiss: (id: number) => void;
  success: (title: string, body?: string, durationMs?: number) => number;
  error: (title: string, body?: string, durationMs?: number) => number;
  warning: (title: string, body?: string, durationMs?: number) => number;
  info: (title: string, body?: string, durationMs?: number) => number;
}

const DEFAULT_DURATION: Record<ToastKind, number> = {
  success: 5000,
  info: 6000,
  warning: 7000,
  error: 10000,
};

export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  useEffect(() => {
    return () => {
      timersRef.current.forEach((handle) => window.clearTimeout(handle));
      timersRef.current.clear();
    };
  }, []);

  const dismiss = (id: number) => {
    const handle = timersRef.current.get(id);
    if (handle) {
      window.clearTimeout(handle);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const push = (kind: ToastKind, title: string, body?: string, durationMs?: number): number => {
    const id = ++idRef.current;
    const dur = durationMs ?? DEFAULT_DURATION[kind];
    setToasts((prev) => [...prev, { id, kind, title, body, durationMs: dur }]);
    if (dur > 0) {
      const handle = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, dur);
      timersRef.current.set(id, handle);
    }
    return id;
  };

  return {
    toasts,
    dismiss,
    success: (title, body, durationMs) => push('success', title, body, durationMs),
    error: (title, body, durationMs) => push('error', title, body, durationMs),
    warning: (title, body, durationMs) => push('warning', title, body, durationMs),
    info: (title, body, durationMs) => push('info', title, body, durationMs),
  };
}

const KIND_STYLES: Record<ToastKind, { bg: string; border: string; title: string; body: string; icon: string }> = {
  success: {
    bg: 'bg-emerald-900/40',
    border: 'border-emerald-700',
    title: 'text-emerald-100',
    body: 'text-emerald-200/90',
    icon: '✓',
  },
  error: {
    bg: 'bg-red-900/40',
    border: 'border-red-700',
    title: 'text-red-100',
    body: 'text-red-200/90',
    icon: '✕',
  },
  warning: {
    bg: 'bg-amber-900/40',
    border: 'border-amber-700',
    title: 'text-amber-100',
    body: 'text-amber-200/90',
    icon: '!',
  },
  info: {
    bg: 'bg-blue-900/40',
    border: 'border-blue-700',
    title: 'text-blue-100',
    body: 'text-blue-200/90',
    icon: 'i',
  },
};

export function ToastStack({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const s = KIND_STYLES[t.kind];
        return (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto ${s.bg} ${s.border} border rounded-lg shadow-lg p-3 flex items-start gap-3`}
          >
            <span className={`${s.title} font-mono text-sm font-bold mt-0.5 select-none`} aria-hidden>
              {s.icon}
            </span>
            <div className="flex-1 min-w-0">
              <div className={`${s.title} font-semibold text-sm break-words`}>{t.title}</div>
              {t.body && (
                <div className={`${s.body} text-xs mt-1 whitespace-pre-wrap break-words`}>{t.body}</div>
              )}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className={`${s.title} hover:opacity-70 text-lg leading-none px-1`}
              aria-label="Dismiss"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}
