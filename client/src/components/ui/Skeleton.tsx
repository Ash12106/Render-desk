interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 ${className}`}></div>
  );
}
