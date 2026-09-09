import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | null;
  isDestructive?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function ConfirmModal({
  isOpen,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  error = null,
  isDestructive = false,
  icon,
  children,
}: ConfirmModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const focusModal = () => {
      const firstFocusable = modalRef.current?.querySelector<HTMLElement>(focusableSelector);
      firstFocusable?.focus();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = Array.from(modalRef.current.querySelectorAll(focusableSelector)) as HTMLElement[];
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    focusModal();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [isOpen, isLoading, onCancel]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={isLoading ? undefined : onCancel}
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px] cursor-pointer"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            className="relative bg-surface rounded-3xl border-4 border-ink shadow-[6px_6px_0px_0px_rgba(9,9,11,1)] sm:shadow-[8px_8px_0px_0px_rgba(9,9,11,1)] p-6 sm:p-8 max-w-[400px] w-full max-h-[90vh] overflow-y-auto z-10 flex flex-col items-center text-center"
          >
            {icon && <div className="mb-6 shrink-0">{icon}</div>}

            <h2 id="confirm-modal-title" className="text-xl sm:text-2xl font-sans font-bold text-ink mb-3 sm:mb-4">
              {title}
            </h2>
            <div className="text-[14px] sm:text-[15px] leading-relaxed font-sans font-medium text-ink-muted mb-6 sm:mb-8">
              {description}
            </div>

            {children && <div className="w-full mb-6 sm:mb-8">{children}</div>}

            {error && (
              <div className="w-full mb-6 p-4 bg-danger text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl border-2 border-ink break-words">
                {error}
              </div>
            )}

            <div className="w-full flex flex-col gap-3 sm:gap-4 shrink-0">
              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={cn(
                  'w-full py-3.5 text-sm font-mono font-bold tracking-wider text-white rounded-full transition-colors disabled:opacity-50',
                  isDestructive ? 'bg-[#b04a44] hover:bg-[#9a3f3a]' : 'bg-ink hover:bg-ink/90',
                )}
              >
                {isLoading ? 'Processing...' : confirmText}
              </button>
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="w-full py-2.5 text-sm font-mono font-bold tracking-wider text-ink hover:underline transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
