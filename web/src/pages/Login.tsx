// web/src/pages/Login.tsx
// Login page with email input and OTP send

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useConfig } from '../hooks/useConfig';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { getConfigValue } from '../lib/config';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type LoginForm = z.infer<typeof loginSchema>;

export function Login() {
  const { signIn } = useAuth();
  const { data: config } = useConfig();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const allowedDomain = getConfigValue<string>(config, 'allowed_email_domain') || 'xxxxxxxxx';
  
  const schema = loginSchema.refine(
    (data) => data.email.endsWith('@' + allowedDomain) || allowedDomain === 'xxxxxxxxx',
    { message: `Must be a @${allowedDomain} email`, path: ['email'] }
  );

  const { register, handleSubmit, formState: { errors }, setError } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    const result = await signIn(data.email);
    setIsLoading(false);
    
    if (result.error) {
      setError('email', { message: result.error.code });
      toast.error(result.error.code === 'ERR_EMAIL_DOMAIN' ? `Must be a @${allowedDomain} email` : 'Failed to send code');
    } else {
      toast.success('Check your college mail for a 6-digit code');
      setResendCooldown(30);
    }
  };

  useState(() => {
    const interval = setInterval(() => {
      setResendCooldown(c => c > 0 ? c - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-text">GatePool</h1>
          <p className="text-text-secondary mt-2">Sign in with your college email</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-text mb-1">Email</label>
            <input
              {...register('email')}
              id="email"
              type="email"
              autoComplete="email"
              placeholder={`student@${allowedDomain}`}
              className="w-full px-4 py-3 border border-border rounded-input text-text bg-white dark:bg-gray-800 focus:ring-1 focus:ring-accent"
              disabled={isLoading || resendCooldown > 0}
            />
            {errors.email && <p className="text-sm text-danger mt-1">{errors.email.message}</p>}
          </div>

          <Button type="submit" fullWidth loading={isLoading} disabled={resendCooldown > 0}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Send code'}
          </Button>
        </form>

        <p className="text-xs text-text-secondary text-center">
          We'll send a 6-digit code to your email
        </p>
      </div>
    </div>
  );
}