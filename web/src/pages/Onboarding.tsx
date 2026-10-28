// @ts-nocheck
// web/src/pages/Onboarding.tsx
// Onboarding page for name and phone

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import { Button } from '../components/Button';
import { toast } from 'sonner';

const onboardingSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(60, 'Name too long').regex(/^[[:alpha:] .'-]{2,60}$/, 'Invalid characters'),
  phone: z.string().optional().refine((val) => !val || /^[0-9]{10}$/.test(val), 'Phone must be 10 digits'),
  share_phone: z.boolean().default(false),
});

type OnboardingForm = z.infer<typeof onboardingSchema>;

export function Onboarding() {
  const { user, refreshUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<OnboardingForm>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: { full_name: '', phone: '', share_phone: false },
  });

  const sharePhone = watch('share_phone');

  const onSubmit = async (data: OnboardingForm) => {
    setIsLoading(true);
    const result = await api.updateProfile({
      full_name: data.full_name,
      phone: data.phone || null,
      share_phone: data.share_phone,
    });
    setIsLoading(false);
    
    if (result.error) {
      toast.error('Failed to save');
    } else {
      await refreshUser();
      toast.success('Profile saved');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold text-text text-center">Complete your profile</h1>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="full_name" className="block text-sm font-medium text-text mb-1">Full name *</label>
            <input
              {...register('full_name')}
              id="full_name"
              type="text"
              autoComplete="name"
              placeholder="Your name"
              className="w-full px-4 py-3 border border-border rounded-input text-text bg-white dark:bg-gray-800 focus:ring-1 focus:ring-accent"
              disabled={isLoading}
            />
            {errors.full_name && <p className="text-sm text-danger mt-1">{errors.full_name.message}</p>}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-text mb-1">Phone (optional)</label>
            <input
              {...register('phone')}
              id="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="10 digits"
              maxLength={10}
              className="w-full px-4 py-3 border border-border rounded-input text-text bg-white dark:bg-gray-800 focus:ring-1 focus:ring-accent"
              disabled={isLoading}
            />
            {errors.phone && <p className="text-sm text-danger mt-1">{errors.phone.message}</p>}
          </div>

          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="share_phone"
              {...register('share_phone')}
              className="mt-1 w-4 h-4 text-accent border-border rounded focus:ring-accent"
              disabled={isLoading}
            />
            <label htmlFor="share_phone" className="text-sm text-text">
              Share my phone number with my pool mates
              <p className="text-xs text-text-secondary mt-1">Enables a WhatsApp chat link for coordination</p>
            </label>
          </div>

          <Button type="submit" fullWidth loading={isLoading}>
            Save and continue
          </Button>
        </form>
      </div>
    </div>
  );
}