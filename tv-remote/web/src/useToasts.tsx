import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type Toast = { id: number; text: string; tone: 'error' | 'info' };

const ToastContext = createContext<(text: string, tone?: Toast['tone']) => void>(() => {});

export const useToast = (): ((text: string, tone?: Toast['tone']) => void) =>
  useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((text: string, tone: Toast['tone'] = 'error') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const valor = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={valor}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto max-w-sm rounded-xl px-4 py-3 text-sm shadow-lg ring-1 ${
              t.tone === 'error'
                ? 'bg-rose-950 text-rose-100 ring-rose-500/40'
                : 'bg-neutral-900 text-neutral-100 ring-neutral-700'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
