// web/src/components/SegmentedControl.tsx
// Segmented control for target preference

import { useState } from 'react';

interface SegmentedControlProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

export function SegmentedControl({ value, onChange, options, disabled }: SegmentedControlProps) {
  return (
    <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-input" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => !disabled && onChange(opt.value)}
          disabled={disabled}
          className={`flex-1 py-2 px-3 text-sm font-medium rounded-[4px] transition-all duration-100 ${
            value === opt.value
              ? 'bg-white text-accent border border-accent shadow-sm dark:bg-gray-700'
              : 'text-text-secondary hover:text-text dark:text-dark-text-secondary dark:hover:text-dark-text'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}