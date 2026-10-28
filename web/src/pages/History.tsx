// web/src/pages/History.tsx
// Ride history page

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import { formatDate, formatTime, formatDateTime } from '../lib/time';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { PLACE_LABEL } from '../types/contract';

export function History() {
  const { user } = useAuth();

  const { data: history, isLoading } = useQuery({
    queryKey: ['history'],
    queryFn: () => api.getRideHistory(20),
    enabled: !!user,
  });

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      SEARCHING: 'Searching',
      MATCHED: 'Matched',
      EXPIRED: 'Expired',
      CANCELLED: 'Cancelled',
      COMPLETED: 'Completed',
    };
    return labels[status] || status;
  };

  if (isLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-12">
        <EmptyState title="No rides yet" message="Your ride history will appear here" />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">
      <h1 className="text-2xl font-semibold text-text">History</h1>
      <div className="space-y-3">
        {history.map((item) => (
          <div key={item.request_id} className="border-b border-border pb-4 last:border-0">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium text-text">{formatDate(item.created_at)}</span>
              <span className="text-sm text-text-secondary capitalize">{getStatusLabel(item.status).toLowerCase()}</span>
            </div>
            <div className="text-text-secondary text-sm mb-1">
              {PLACE_LABEL[item.origin]} to {PLACE_LABEL[item.destination]}
            </div>
            <div className="flex gap-4 text-xs text-text-secondary">
              <span>Party: {item.party_size}</span>
              {item.pool_capacity && <span>Pool: {item.pool_seats_taken}/{item.pool_capacity}</span>}
              {item.meet_at && <span>Met at {formatTime(item.meet_at)}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}