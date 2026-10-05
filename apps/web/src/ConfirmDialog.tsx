import { useCallback, useState, type ReactNode } from 'react';
import { Kbd } from './ui';

interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
}

interface Pending extends ConfirmOptions {
  resolve: (ok: boolean) => void;
}

/**
 * An in-app confirmation, in place of `window.confirm`. Returns the dialog element to render
 * and `confirm(options)`, which resolves true on confirm and false on cancel.
 */
export function useConfirm(): [ReactNode, (options: ConfirmOptions) => Promise<boolean>] {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  const dialog = pending && (
    <div className="dialog-scrim" onMouseDown={() => settle(false)}>
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={pending.title}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            settle(false);
          }
        }}
      >
        <h2 className="dialog-title">{pending.title}</h2>
        {pending.message && <div className="dialog-message">{pending.message}</div>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-quiet" onClick={() => settle(false)}>
            Cancel
            <Kbd>esc</Kbd>
          </button>
          <button type="button" className="btn btn-primary" onClick={() => settle(true)} autoFocus>
            {pending.confirmLabel}
            <Kbd>↵</Kbd>
          </button>
        </div>
      </div>
    </div>
  );

  return [dialog, confirm];
}
