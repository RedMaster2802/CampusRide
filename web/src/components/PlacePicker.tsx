// web/src/components/PlacePicker.tsx
// Place picker with radio list and swap

import { PLACES, PLACE_LABEL, type Place } from '../types/contract';

interface PlacePickerProps {
  from: Place | null;
  to: Place | null;
  onFromChange: (place: Place) => void;
  onToChange: (place: Place) => void;
  onSwap: () => void;
  disabled?: boolean;
}

export function PlacePicker({ from, to, onFromChange, onToChange, onSwap, disabled }: PlacePickerProps) {
  const renderPlaceList = (label: string, value: Place | null, onChange: (p: Place) => void, disabledPlace?: Place) => (
    <div>
      <label className="block text-sm font-medium text-text mb-2">{label}</label>
      <div className="space-y-2" role="radiogroup" aria-label={label}>
        {PLACES.map((place) => (
          <button
            key={place}
            type="button"
            role="radio"
            aria-checked={value === place}
            onClick={() => !disabled && onChange(place)}
            disabled={disabled || place === disabledPlace}
            className={`w-full text-left px-4 py-3 border rounded-input transition-all duration-100 ${
              value === place
                ? 'border-accent bg-accent/5 text-accent'
                : 'border-border text-text hover:border-accent/50 dark:border-dark-border dark:text-dark-text dark:hover:border-accent/50'
            } ${disabled || place === disabledPlace ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{PLACE_LABEL[place]}</span>
              {value === place && (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {renderPlaceList('From', from, onFromChange, to || undefined)}
        {renderPlaceList('To', to, onToChange, from || undefined)}
      </div>
      {(from || to) && (
        <button
          type="button"
          onClick={onSwap}
          disabled={disabled}
          className="w-full py-2 text-sm text-text-secondary hover:text-text dark:text-dark-text-secondary dark:hover:text-dark-text transition-colors"
        >
          Swap
        </button>
      )}
    </div>
  );
}