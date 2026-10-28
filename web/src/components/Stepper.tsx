// web/src/components/Stepper.tsx
// Number stepper for party size

import { useState } from 'react';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  label?: string;
  disabled?: boolean;
}

export function Stepper({ value, onChange, min, max, label, disabled }: StepperProps) {
  const increment = () => {
    if (value < max) onChange(value + 1);
  };
  const decrement = () => {
    if (value > min) onChange(value - 1);
  };

  return (
    <div className="flex items-center gap-4">
      {label && <label className="text-sm font-medium text-text w-32">{label}</label>}
      <div className="flex items-center border border-border rounded-input overflow-hidden" style={{ minWidth: '120px' }}>
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || value <= min}
          className="px-4 py-2 text-text hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Decrease"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
        </button>
        <span className="w-16 text-center text-base font-medium text-text">{value}</span>
        <button
          type="button"
          onClick={increment}
          disabled={disabled || value >= max}
          className="px-4 py-2 text-text hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          aria-label="Increase"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
        </button>
      </div>
    </div>
  );
}