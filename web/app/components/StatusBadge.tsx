interface StatusBadgeProps {
  status: 'success' | 'error' | 'warning' | 'info';
  children: React.ReactNode;
}

export default function StatusBadge({ status, children }: StatusBadgeProps) {
  const styles = {
    success: 'bg-green-100 text-green-800 border-green-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium border ${styles[status]}`}
    >
      {children}
    </span>
  );
}
