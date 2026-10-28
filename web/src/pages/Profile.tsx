// web/src/pages/Profile.tsx
// Profile page

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { toast } from 'sonner';

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(60, 'Name too long').regex(/^[[:alpha:] .'-]{2,60}$/, 'Invalid characters'),
  phone: z.string().optional().refine((val) => !val || /^[0-9]{10}$/.test(val), 'Phone must be 10 digits'),
  share_phone: z.boolean().default(false),
});

type ProfileForm = z.infer<typeof profileSchema>;

export function Profile() {
  const { user, signOut, refreshUser } = useAuth();
  const { prompt, isInstalled, isIOS, install } = useInstallPrompt();
  const [isLoading, setIsLoading] = useState(false);
  const [showBlocked, setShowBlocked] = useState(false);

  const { register, handleSubmit, formState: { errors }, watch, setValue, reset } = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { full_name: '', phone: '', share_phone: false },
  });

  // Load profile on mount
  useState(() => {
    api.getProfile().then(data => {
      if (data) reset(data);
    });
  });

  const onSubmit = async (data: ProfileForm) => {
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
      toast.success('Saved');
      await refreshUser();
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text">Profile</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="full_name" className="block text-sm font-medium text-text mb-1">Full name</label>
          <input
            {...register('full_name')}
            id="full_name"
            type="text"
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

        <Button type="submit" fullWidth loading={isLoading}>Save</Button>
      </form>

      <div className="border-t border-border pt-6 space-y-4">
        <Button variant="secondary" fullWidth onClick={handleSignOut}>Sign out</Button>

        {!isInstalled && (prompt || isIOS) && (
          <div className="space-y-2">
            {isIOS ? (
              <p className="text-sm text-text-secondary text-center">
                Tap Share → Add to Home Screen to install
              </p>
            ) : (
              <Button variant="secondary" fullWidth onClick={install}>Install app</Button>
            )}
          </div>
        )}

        <p className="text-xs text-text-secondary text-center">GatePool v1.0.0</p>
      </div>
    </div>
  );
}