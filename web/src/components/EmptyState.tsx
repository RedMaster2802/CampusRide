// web/src/components/EmptyState.tsx
// Empty state with message and action

import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="py-12 px-4 text-center">
      <p className="text-text font-medium">{title}</p>
      {message && <p className="text-text-secondary text-sm mt-2">{message}</p>}
      {action && (
        <Button onClick={action.onClick} className="mt-4" variant="primary">
          {action.label}
        </Button>
      )}
    </div>
  );
}