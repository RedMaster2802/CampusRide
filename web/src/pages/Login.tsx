// web/src/pages/Login.tsx
// Login page with email input and OTP send

import { useState } from 'react';
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

const ALLOWED_EMAIL_DOMAIN = import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || '';

export function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const schema = loginSchema.refine(
    (data) => {
      const domain = ALLOWED_EMAIL_DOMAIN;
      // Skip domain check in mock mode or when not configured
      if (!domain || import.meta.env.VITE_USE_MOCK === 'true') return true;
      const email = data.email.trim().toLowerCase();
      return email.endsWith('@' + domain.toLowerCase());
    },
    { message: (() => {
      const domain = ALLOWED_EMAIL_DOMAIN;
      if (!domain) return 'Invalid email domain configuration';
      return `Use your college email (@${domain})`;
    })(), path: ['email'] }
  );

  const { register, handleSubmit, formState: { errors }, setError } = useForm<LoginForm>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    // Lowercase and trim email before sending
    const email = data.email.trim().toLowerCase();
    const result = await signIn(email);
    setIsLoading(false);
    
    if (result.error) {
      if (result.error.code === 'ERR_EMAIL_DOMAIN') {
        setError('email', { message: `Use your college email (@${ALLOWED_EMAIL_DOMAIN})` });
        toast.error(`Use your college email (@${ALLOWED_EMAIL_DOMAIN})`);
      } else if (result.error.message?.includes('Database error')) {
        toast.error(`Use your college email (@${ALLOWED_EMAIL_DOMAIN})`);
      } else {
        toast.error('Failed to send code');
      }
    } else {
      toast.success('Check your college mail for a 6-digit code');
      navigate('/verify', { state: { email }, replace: true });
    }
  };

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
              placeholder={ALLOWED_EMAIL_DOMAIN ? `enrollmentno@${ALLOWED_EMAIL_DOMAIN}` : 'student@college.edu'}
              className="w-full px-4 py-3 border border-border rounded-input text-text bg-white dark:bg-gray-800 focus:ring-1 focus:ring-accent"
              disabled={isLoading}
            />
            {errors.email && <p className="text-sm text-danger mt-1">{errors.email.message}</p>}
          </div>

          <Button type="submit" fullWidth loading={isLoading}>
            Send code
          </Button>
        </form>

        <p className="text-xs text-text-secondary text-center">
          We'll send a 6-digit code to your email
        </p>
      </div>
    </div>
  );
}