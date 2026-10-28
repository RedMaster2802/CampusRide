// web/src/pages/Verify.tsx
// OTP verification page

import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button } from '../components/Button';
import { toast } from 'sonner';

const verifySchema = z.object({
  code: z.string().length(6, 'Enter 6-digit code').regex(/^\d+$/, 'Numbers only'),
});

type VerifyForm = z.infer<typeof verifySchema>;

export function Verify() {
  const { verifyOtp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const inputsRef = useRef<HTMLInputElement[]>([]);

  // Get email from location state
  const email = (location.state as any)?.email || '';

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    mode: 'onChange',
  });

  const code = watch('code');

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !errors.code) {
      handleSubmit(onSubmit)();
    }
  }, [code, errors.code, handleSubmit]);

  const onSubmit = async (data: VerifyForm) => {
    setIsLoading(true);
    const result = await verifyOtp(email, data.code);
    setIsLoading(false);
    
    if (result.error) {
      toast.error('Wrong code');
      setValue('code', '');
      inputsRef.current[0]?.focus();
    } else {
      navigate('/', { replace: true });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold text-text">Verify your email</h1>
        <p className="text-text-secondary">Enter the 6-digit code sent to <strong>{email}</strong></p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="flex gap-2 justify-center" role="group" aria-label="6-digit code">
            {[0,1,2,3,4,5].map((i) => (
              <input
                key={i}
                ref={(el) => { if (el) inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={1}
                {...register('code', { value: code[i] || '' })}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val && i < 5) inputsRef.current[i + 1]?.focus();
                  if (!val && i > 0) inputsRef.current[i - 1]?.focus();
                  setValue('code', code.slice(0, i) + val + code.slice(i + 1));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Backspace' && !code[i] && i > 0) {
                    inputsRef.current[i - 1]?.focus();
                  }
                }}
                className="w-10 h-12 text-center text-xl font-medium border border-border rounded-input text-text bg-white dark:bg-gray-800 focus:ring-1 focus:ring-accent"
                disabled={isLoading}
              />
            ))}
          </div>
          {errors.code && <p className="text-sm text-danger">{errors.code.message}</p>}

          <Button type="submit" fullWidth loading={isLoading} disabled={code.length !== 6}>
            Verify
          </Button>
        </form>

        <p className="text-xs text-text-secondary">
          Didn't receive the code? <a href="/login" className="text-accent hover:underline">Go back</a>
        </p>
      </div>
    </div>
  );
}