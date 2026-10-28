// @ts-nocheck
// web/src/pages/Home.tsx
// Home page - request form or active ride view

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useActiveRide } from '../hooks/useActiveRide';
import { useConfig } from '../hooks/useConfig';
import { api } from '../api';
import type { Place, TargetPref } from '../types/contract';
import { PLACES, PLACE_LABEL } from '../types/contract';
import { formatTime, formatDateTime, parseLocalToIST, getISTNow } from '../lib/time';
import { getErrorMessage, isAuthError } from '../lib/errors';
import { Button } from '../components/Button';
import { PlacePicker } from '../components/PlacePicker';
import { Stepper } from '../components/Stepper';
import { SegmentedControl } from '../components/SegmentedControl';
import { TimeWindowPicker } from '../components/TimeWindowPicker';
import { SeatsBar } from '../components/SeatsBar';
import { MemberList } from '../components/MemberList';
import { FarePanel } from '../components/FarePanel';
import { Countdown } from '../components/Countdown';
import { EmptyState } from '../components/EmptyState';
import { Banner } from '../components/Banner';
import { toast } from 'sonner';

const requestSchema = z.object({
  from: z.string().min(1, 'Select origin'),
  to: z.string().min(1, 'Select destination'),
  party_size: z.number().min(1),
  target: z.enum(['4', '6', 'ANY']),
  window_start: z.string(),
  window_end: z.string(),
}).refine((data) => data.from !== data.to, {
  message: 'Pick two different places',
  path: ['to'],
});

type RequestForm = z.infer<typeof requestSchema>;

const TARGET_OPTIONS = [
  { value: '4' as const, label: '4 seats (default)' },
  { value: '6' as const, label: '6 seats' },
  { value: 'ANY' as const, label: 'Any' },
];

export function Home() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const { data: activeRide, isLoading, refetch } = useActiveRide();

  const minWindow = config?.min_window_minutes as number || 30;
  const maxWindow = config?.max_window_minutes as number || 180;
  const maxAdvance = config?.max_advance_minutes as number || 1440;
  const maintenanceMode = config?.maintenance_mode as boolean || false;

  // Form state
  const [formData, setFormData] = useState<Partial<RequestForm>>({
    from: null,
    to: null,
    party_size: 1,
    target: '4',
    window_start: '',
    window_end: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize window to "Leave now (30 min)"
  useEffect(() => {
    const now = getISTNow();
    const start = now.toISOString();
    const end = new Date(now.getTime() + 30 * 60000).toISOString();
    setFormData(prev => ({ ...prev, window_start: start, window_end: end }));
  }, []);

  // Determine max party size based on target
  const maxPartySize = formData.target === '6' ? 5 : 3;

  // Clamp party size when target changes
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      party_size: Math.min(prev.party_size || 1, maxPartySize),
    }));
  }, [maxPartySize]);

  // Helper text based on form
  const helperText = (() => {
    if (formData.target === '4' && formData.party_size === 3) return 'You need 1 more rider';
    if (formData.target === '4' && formData.party_size === 2) return 'You need 2 more riders';
    if (formData.target === '6' && formData.party_size === 5) return 'You need 1 more rider';
    if (formData.target === '6' && formData.party_size === 4) return 'You need 2 more riders';
    if (formData.target === '6' && formData.party_size === 3) return 'You need 3 more riders';
    if (formData.target === '6' && formData.party_size === 2) return 'You need 4 more riders';
    if (formData.target === '6' && formData.party_size === 1) return 'You need 5 more riders';
    if (formData.target === 'ANY' && formData.party_size === 3) return 'Pool fills at 4 seats';
    return '';
  })();

  const handleSubmit = async (data: RequestForm) => {
    if (maintenanceMode) {
      toast.error('GatePool is paused for maintenance');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await api.createRideRequest({
        p_origin: data.from as Place,
        p_destination: data.to as Place,
        p_party_size: data.party_size,
        p_target: data.target as TargetPref,
        p_window_start: data.window_start,
        p_window_end: data.window_end,
      });
      
      if (result.request.status === 'EXPIRED') {
        toast.error('No pool found this time');
      } else if (!result.pool) {
        toast.success('You\'re in the queue, finding your pool');
      }
      
      await refreshUser();
    } catch (error: any) {
      if (isAuthError(error)) {
        navigate('/login');
      } else {
        toast.error(getErrorMessage(error));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show active ride if exists
  if (activeRide) {
    return <ActiveRideView ride={activeRide} onRefresh={refetch} />;
  }

  // Request form
  return (
    <div className="min-h-screen pb-24">
      <div className="max-w-md mx-auto px-4 py-8 space-y-8">
        {maintenanceMode && (
          <Banner type="warning" message="GatePool is paused for maintenance. Please try again soon." />
        )}

        <h1 className="text-2xl font-semibold text-text">Find a pool</h1>

        <form onSubmit={handleSubmit} className="space-y-8" noValidate>
          <PlacePicker
            from={formData.from as Place | null}
            to={formData.to as Place | null}
            onFromChange={(p) => setFormData(prev => ({ ...prev, from: p }))}
            onToChange={(p) => setFormData(prev => ({ ...prev, to: p }))}
            onSwap={() => setFormData(prev => ({ from: prev.to, to: prev.from }))}
            disabled={isSubmitting}
          />

          <Stepper
            label="Group size"
            value={formData.party_size || 1}
            onChange={(v) => setFormData(prev => ({ ...prev, party_size: v }))}
            min={1}
            max={maxPartySize}
            disabled={isSubmitting}
          />

          <div>
            <label className="block text-sm font-medium text-text mb-2">Cab size target</label>
            <SegmentedControl
              value={formData.target}
              onChange={(v) => setFormData(prev => ({ ...prev, target: v }))}
              options={TARGET_OPTIONS}
              disabled={isSubmitting}
            />
          </div>

          <TimeWindowPicker
            windowStart={formData.window_start}
            windowEnd={formData.window_end}
            onChange={(start, end) => setFormData(prev => ({ ...prev, window_start: start, window_end: end }))}
            minWindowMinutes={minWindow}
            maxWindowMinutes={maxWindow}
            maxAdvanceMinutes={maxAdvance}
            disabled={isSubmitting}
          />

          {helperText && (
            <p className="text-sm text-text-secondary">{helperText}</p>
          )}

          <Button type="submit" fullWidth loading={isSubmitting} disabled={!formData.from || !formData.to || isSubmitting}>
            Find my pool
          </Button>
        </form>
      </div>
    </div>
  );
}

function ActiveRideView({ ride, onRefresh }: { ride: any; onRefresh: () => void }) {
  const { user } = useAuth();
  const [cancelConfirm, setCancelConfirm] = useState(false);

  const request = ride.request;
  const pool = ride.pool;
  const members = ride.members;

  const handleCancel = async () => {
    if (!pool || request.status === 'SEARCHING' && !pool) {
      // Queued or searching - no strike
      await api.cancelRideRequest(request.id);
      toast.success('Cancelled');
      onRefresh();
      return;
    }

    if (pool.status === 'CONFIRMED' && pool.lock_at) {
      const lockTime = new Date(pool.lock_at).getTime();
      if (Date.now() > lockTime) {
        if (!cancelConfirm) {
          setCancelConfirm(true);
          return;
        }
      }
    }

    const result = await api.cancelRideRequest(request.id);
    if (result.strike_added) {
      toast.error('Late cancellation counted as a strike');
    } else {
      toast.success('Cancelled');
    }
    onRefresh();
  };

  const handleClaimBooker = async () => {
    if (!pool) return;
    await api.claimBooker(pool.id);
    toast.success('You\'re booking the cab');
    onRefresh();
  };

  const handleArrived = async (arrived: boolean) => {
    if (!pool) return;
    await api.markArrived(pool.id, arrived);
    onRefresh();
  };

  // Render based on state
  if (request.status === 'SEARCHING' && !pool) {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-border border-t-accent mx-auto" />
          <h2 className="text-xl font-medium text-text">You're in the queue</h2>
          <p className="text-text-secondary">Finding your pool...</p>
          <div className="text-sm text-text-secondary">
            {formatDateTime(request.window_start)} – {formatTime(request.window_end)}
          </div>
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
        </div>
      </div>
    );
  }

  if (request.status === 'SEARCHING' && pool?.status === 'OPEN') {
    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          <div className="border border-border rounded-input p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-text">{PLACE_LABEL[pool.origin]} to {PLACE_LABEL[pool.destination]}</p>
                <p className="text-sm text-text-secondary">{formatDateTime(pool.window_start)} – {formatTime(pool.window_end)}</p>
              </div>
            </div>
            <SeatsBar seatsTaken={pool.seats_taken} capacity={pool.capacity} />
            <p className="text-text-secondary text-center">Finding riders</p>
            
            <MemberList members={members} currentUserId={user?.id || ''} />
            
            <div className="text-sm text-text-secondary text-center">
              If at least {pool.fallback_min_seats} seats are filled we confirm at {formatTime(pool.fallback_at)}, otherwise we will let you know
            </div>

            <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  if (request.status === 'MATCHED' && pool?.status === 'CONFIRMED') {
    const isBooker = pool.booker_user_id === user?.id;
    const showStrikeWarning = pool.lock_at && Date.now() > new Date(pool.lock_at).getTime();

    return (
      <div className="min-h-screen pb-24">
        <div className="max-w-md mx-auto px-4 py-8 space-y-6">
          <div className="border border-border rounded-input p-4 space-y-4">
            <div className="text-center space-y-2">
              <p className="text-2xl font-semibold text-text">Meet at {pool.meeting_point_name}</p>
              <Countdown target={pool.meet_at!} />
              <p className="text-text-secondary">{PLACE_LABEL[pool.origin]} to {PLACE_LABEL[pool.destination]}</p>
            </div>

            <MemberList 
              members={members} 
              currentUserId={user?.id || ''} 
              onArrivedChange={handleArrived}
              showPhone={true}
            />

            <FarePanel
              fareTotal={pool.fare_total_inr}
              farePerSeat={pool.fare_per_seat_inr}
              myFare={pool.my_fare_inr}
              partySize={request.party_size}
            />

            {pool.booker_user_id ? (
              <p className="text-sm text-text-secondary text-center">
                {members.find(m => m.user_id === pool.booker_user_id)?.full_name || 'Someone'} is booking the cab
              </p>
            ) : (
              <Button fullWidth onClick={handleClaimBooker}>I'll book the cab</Button>
            )}

            <Button 
              variant={showStrikeWarning ? 'destructive' : 'secondary'} 
              onClick={handleCancel}
              className={showStrikeWarning ? 'border-danger' : ''}
            >
              {showStrikeWarning ? 'Cancel (counts as strike)' : 'Cancel'}
            </Button>

            {showStrikeWarning && (
              <Banner type="error" message="Cancelling now counts as a strike. 3 strikes block you for 7 days." />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (request.status === 'EXPIRED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <EmptyState
          title="No pool found this time"
          message="Not enough riders joined before the deadline."
          action={{ label: 'Search again', onClick: () => {
            // Prefill form with same values
            setFormData(prev => ({
              ...prev,
              from: request.origin,
              to: request.destination,
              party_size: request.party_size,
              target: request.target,
              window_start: getISTNow().toISOString(),
              window_end: new Date(getISTNow().getTime() + (new Date(request.window_end).getTime() - new Date(request.window_start).getTime())).toISOString(),
            }));
            onRefresh();
          }}}
        />
      </div>
    );
  }

  if (request.status === 'COMPLETED') {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <EmptyState
          title="Ride completed"
          message="Thanks for using GatePool"
          action={{ label: 'Plan another ride', onClick: () => onRefresh() }}
        />
      </div>
    );
  }

  return null;
}