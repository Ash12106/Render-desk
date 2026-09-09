import React from 'react';
import { cn } from '@/src/lib/utils';
import { Priority, Status } from '@/src/types';
import { Circle, Clock, CheckCircle2, XCircle, ArrowUp, ArrowRight, ArrowDown } from 'lucide-react';

export function StatusBadge({ status, className }: { status: Status; className?: string }) {
  const getStatusIcon = () => {
    switch (status) {
      case 'Open':
        return <Circle className="w-3 h-3 mr-1.5" strokeWidth={3} />;
      case 'In Progress':
        return <Clock className="w-3 h-3 mr-1.5" strokeWidth={3} />;
      case 'Resolved':
        return <CheckCircle2 className="w-3 h-3 mr-1.5" strokeWidth={3} />;
      case 'Closed':
        return <XCircle className="w-3 h-3 mr-1.5" strokeWidth={3} />;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border-2 border-ink',
        status === 'Resolved' || status === 'Closed'
          ? 'bg-success text-white border-success'
          : 'bg-info text-white border-info',
        className,
      )}
    >
      {getStatusIcon()}
      {status}
    </span>
  );
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const getPriorityIcon = () => {
    switch (priority) {
      case 'High':
        return <ArrowUp className="w-3 h-3 mr-1" strokeWidth={3} />;
      case 'Medium':
        return <ArrowRight className="w-3 h-3 mr-1" strokeWidth={3} />;
      case 'Low':
        return <ArrowDown className="w-3 h-3 mr-1" strokeWidth={3} />;
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-mono text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border-2',
        priority === 'High' && 'bg-danger text-white border-danger',
        priority === 'Medium' && 'bg-warning text-white border-warning',
        priority === 'Low' && 'bg-success text-white border-success',
        className,
      )}
    >
      {getPriorityIcon()}
      {priority}
    </span>
  );
}
