import React from 'react';
import { ToastMessage } from '../hooks/useToast';

interface ToastProps {
  toasts: ToastMessage[];
}

export const Toast: React.FC<ToastProps> = ({ toasts }) => {
  if (toasts.length === 0) return null;

  return (
    <>
      {toasts.map((toast, index) => (
        <div
          key={toast.id}
          role="alert"
          className="fixed bottom-6 right-6 z-[999] flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg animate-slide-up max-w-[340px]"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            transform: `translateY(${index * -60}px)`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              background: toast.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
            }}
          />
          <span className="text-sm">{toast.message}</span>
        </div>
      ))}
      <style>{`
        @keyframes slide-up {
          from { transform: translateY(120%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
      `}</style>
    </>
  );
};
