import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getSlaStatus(dueDate?: string): 'overdue' | 'warning' | 'ok' | null {
  if (!dueDate) return null;
  const due = new Date(dueDate).getTime();
  const now = new Date().getTime();
  const timeDiff = due - now;
  const hoursRemaining = timeDiff / (1000 * 60 * 60);

  if (hoursRemaining < 0) return 'overdue';
  if (hoursRemaining <= 48) return 'warning'; // 48 hours warning
  return 'ok';
}
