import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/** A toast dismisses itself after this long. */
export const TOAST_MS = 6000;

export interface ToastOptions {
  message: string;
  /** One button, e.g. Undo. Clicking it also dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /**
   * The document edit the toast is about. The next edit of that document dismisses it, so an
   * Undo button never undoes something other than what the toast names.
   */
  owner?: { doc: string; revision: number };
}

export interface Toasts {
  show: (options: ToastOptions) => void;
  dismiss: () => void;
  /** The toast on screen, if any. */
  current: ToastOptions | null;
}

const ToastContext = createContext<Toasts | null>(null);

/** The toasts of the enclosing Shell. */
export function useToast(): Toasts {
  const toasts = useContext(ToastContext);
  if (!toasts) throw new Error('useToast is only available inside the shell');
  return toasts;
}

export const ToastProvider = ToastContext.Provider;

/**
 * One short-lived message at a time, in place of the last. Returns the element to render
 * (placed by the caller so it clears the canvas toolbar and save status) and the API.
 */
export function useToasts(): [ReactNode, Toasts] {
  const [shown, setShown] = useState<(ToastOptions & { id: number }) | null>(null);

  const show = useCallback((options: ToastOptions) => {
    setShown((prev) => ({ ...options, id: (prev?.id ?? 0) + 1 }));
  }, []);
  const dismiss = useCallback(() => setShown(null), []);

  useEffect(() => {
    if (!shown) return;
    const timer = setTimeout(() => {
      setShown((s) => (s?.id === shown.id ? null : s));
    }, TOAST_MS);
    return () => clearTimeout(timer);
  }, [shown]);

  const api = useMemo(() => ({ show, dismiss, current: shown }), [show, dismiss, shown]);

  const element = (
    <div className="toast-region" aria-live="polite">
      {shown && (
        <div key={shown.id} className="toast" role="status">
          <span className="toast-message">{shown.message}</span>
          {shown.action && (
            <button
              type="button"
              className="btn btn-quiet btn-tight toast-action"
              onClick={() => {
                const { onClick } = shown.action ?? {};
                setShown(null);
                onClick?.();
              }}
            >
              {shown.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
  return [element, api];
}
