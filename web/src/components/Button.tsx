// web/src/components/Button.tsx
// Primary, secondary, destructive buttons

import { forwardRef, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, fullWidth, disabled, children, className = '', ...props }, ref) => {
    const base = 'inline-flex items-center justify-center font-medium text-sm rounded-btn transition-colors duration-100 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] px-4';
    
    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-accent text-white border-accent hover:bg-accent/90 focus:ring-accent',
      secondary: 'bg-white text-text border border-border hover:bg-gray-50 focus:ring-accent dark:bg-dark-background dark:text-dark-text dark:border-dark-border dark:hover:bg-gray-900',
      destructive: 'bg-white text-danger border-danger hover:bg-danger/10 focus:ring-danger',
      ghost: 'bg-transparent text-text hover:bg-gray-100 focus:ring-accent dark:hover:bg-gray-800',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
        {...props}
      >
        {loading && (
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';