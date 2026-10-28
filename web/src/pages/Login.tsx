// web/src/pages/Login.tsx
// Login page with email input and OTP send

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/Button';
import { toast } from 'sonner';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
});

type LoginForm = z.infer<typeof loginSchema>;

const ALLOWED_EMAIL_DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'xxxxxxxxx';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const schema = loginSchema.refine(
    (data) => data.email.endsWith('@' + ALLOWED_EMAIL_DOMAIN) || ALLOWED_EMAIL_DOMAIN === 'xxxxxxxxx',
    { message: `Must be a @${ALLOWED_EMAIL_DOMAIN} email`, path: ['email'] }
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
      toast.error(result.error.code === 'ERR_EMAIL_DOMAIN' ? `Must be a @${ALLOWED_EMAIL_DOMAIN} email` : 'Failed to send code');
    } else {
      toast.success('Check your college mail for a 6-digit code');
      setResendCooldown(30);
      navigate('/verify', { state: { email: data.email }, replace: true });
    }
  };

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(c => c > 0 ? c - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

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
              placeholder={`student@${ALLOWED_EMAIL_DOMAIN}`}
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