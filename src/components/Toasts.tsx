import { useEffect } from 'react';
import type { Toast, ToastAction } from '../sync/engine';
import { AlertIcon, CloseIcon, ConflictIcon } from './Icons';

interface ToastsProps {
  toasts: Toast[];
  /** Distance from the bottom of the window, so the stack sits above the bottom bar. */
  bottom: number;
  onAction: (action: ToastAction) => void;
  onDismiss: (id: string) => void;
}

export function Toasts({ toasts, bottom, onAction, onDismiss }: ToastsProps) {
  // Info messages fade on their own. Errors and conflicts stay until handled.
  useEffect(() => {
    const timers = toasts.filter((t) => t.tone === 'info').map((t) => setTimeout(() => onDismiss(t.id), 4000));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  return (
    <div className="toasts" style={{ bottom }}>
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'info' ? 'status' : 'alert'}>
          {t.tone === 'error' && <AlertIcon />}
          {t.tone === 'conflict' && <ConflictIcon />}
          <span className="toast-msg">{t.message}</span>
          {t.action && (
            <button type="button" className="btn btn--small btn--outline" onClick={() => onAction(t.action!)}>
              {t.action.label}
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => onDismiss(t.id)}>
            <CloseIcon />
          </button>
        </div>
      ))}
    </div>
  );
}
