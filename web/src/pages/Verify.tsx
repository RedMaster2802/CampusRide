// web/src/pages/Verify.tsx
// OTP verification page

import { useState, useEffect, useRef, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { toast } from 'sonner';

const verifySchema = z.object({
  code: z.string().length(6, 'Enter 6-digit code').regex(/^\d+$/, 'Numbers only'),
});

type VerifyForm = z.infer<typeof verifySchema>;

export function Verify() {
  const { verifyOtp, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const inputsRef = useRef<HTMLInputElement[]>([]);
  const submittedRef = useRef(false);

  // Get email from location state
  const email = (location.state as any)?.email || '';

  // Redirect to login if no email
  useEffect(() => {
    if (!email) {
      navigate('/login', { replace: true });
    }
  }, [email, navigate]);

  const { handleSubmit, formState: { errors }, setValue, watch, reset } = useForm<VerifyForm>({
    resolver: zodResolver(verifySchema),
    mode: 'onChange',
    defaultValues: { code: '' },
  });

  const code = watch('code') || '';

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6 && !errors.code && !submittedRef.current) {
      submittedRef.current = true;
      handleSubmit(onSubmit)();
    }
  }, [code, errors.code, handleSubmit]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown(c => c > 0 ? c - 1 : 0);
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const onSubmit = async (data: VerifyForm) => {
    setIsLoading(true);
    const result = await verifyOtp(email, data.code);
    setIsLoading(false);
    
    if (result.error) {
      toast.error('Wrong code');
      reset({ code: '' });
      inputsRef.current[0]?.focus();
      submittedRef.current = false;
    } else {
      navigate('/', { replace: true });
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setIsLoading(true);
    const result = await signIn(email);
    setIsLoading(false);
    if (result.error) {
      toast.error('Failed to resend code');
    } else {
      toast.success('Code resent');
      setResendCooldown(30);
    }
  };

  const handleInputChange = (index: number, value: string) => {
    // Strip non-digits
    const digits = value.replace(/\D/g, '');
    
    if (digits.length > 1) {
      // Paste or multi-char input: distribute across boxes
      let newCode = code;
      for (let i = 0; i < digits.length && index + i < 6; i++) {
        newCode = newCode.slice(0, index + i) + digits[i] + newCode.slice(index + i + 1);
      }
      setValue('code', newCode, { shouldValidate: true });
      
      // Focus the next empty box or last box
      const nextIndex = Math.min(index + digits.length, 5);
      inputsRef.current[nextIndex]?.focus();
    } else {
      // Single character input
      const newCode = code.slice(0, index) + digits + code.slice(index + 1);
      setValue('code', newCode, { shouldValidate: true });

      if (digits && index < 5) {
        inputsRef.current[index + 1]?.focus();
      } else if (!digits && index > 0) {
        inputsRef.current[index - 1]?.focus();
      }
    }
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
    if (!pasted) return;
    
    // Distribute pasted digits starting from first empty box or current box
    let startIndex = 0;
    while (startIndex < 6 && code[startIndex]) startIndex++;
    if (startIndex >= 6) startIndex = 0;
    
    let newCode = code;
    for (let i = 0; i < pasted.length && startIndex + i < 6; i++) {
      newCode = newCode.slice(0, startIndex + i) + pasted[i] + newCode.slice(startIndex + i + 1);
    }
    setValue('code', newCode, { shouldValidate: true });
    
    const nextIndex = Math.min(startIndex + pasted.length, 5);
    inputsRef.current[nextIndex]?.focus();
  }, [code, setValue]);

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-semibold text-text">Verify your email</h1>
        <p className="text-text-secondary">Enter the 6-digit code sent to <strong>{email}</strong></p>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="flex gap-2 justify-center" role="group" aria-label="6-digit code" onPaste={handlePaste}>
            {[0,1,2,3,4,5].map((i) => (
              <input
                key={i}
                ref={(el) => { if (el) inputsRef.current[i] = el; }}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code[i] || ''}
                onChange={(e) => handleInputChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
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

        <div className="space-y-2 text-xs text-text-secondary">
          <p>Didn't receive the code? <Link to="/login" className="text-accent hover:underline">Go back</Link></p>
          <Button 
            variant="secondary" 
            fullWidth 
            onClick={handleResend}
            disabled={resendCooldown > 0 || isLoading}
          >
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
          </Button>
        </div>
      </div>
    </div>
  );
}
