// web/src/components/Banner.tsx
// Banner for maintenance, offline, etc.

interface BannerProps {
  message: string;
  type?: 'info' | 'warning' | 'error';
  action?: { label: string; onClick: () => void };
}

export function Banner({ message, type = 'info', action }: BannerProps) {
  const styles = {
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-200',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200',
  };

  return (
    <div className={`p-4 border rounded-input ${styles[type]}`} role="alert">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm">{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="text-sm font-medium underline hover:no-underline whitespace-nowrap"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}