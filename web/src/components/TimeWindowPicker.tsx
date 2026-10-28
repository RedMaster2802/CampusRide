// web/src/components/TimeWindowPicker.tsx
// Time window picker with quick chips and custom

import { useState, useMemo } from 'react';
import { formatTime, formatDate, formatDateTime, isToday, isTomorrow, parseLocalToIST, getISTNow } from '../lib/time';

interface TimeWindowPickerProps {
  windowStart: string;
  windowEnd: string;
  onChange: (start: string, end: string) => void;
  minWindowMinutes: number;
  maxWindowMinutes: number;
  maxAdvanceMinutes: number;
  disabled?: boolean;
}

const QUICK_OPTIONS = [
  { label: 'Leave now (next 30 min)', minutes: 30 },
  { label: 'Next hour', minutes: 60 },
  { label: 'Next 2 hours', minutes: 120 },
];

export function TimeWindowPicker({ 
  windowStart, 
  windowEnd, 
  onChange, 
  minWindowMinutes, 
  maxWindowMinutes, 
  maxAdvanceMinutes,
  disabled 
}: TimeWindowPickerProps) {
  const [mode, setMode] = useState<'quick' | 'custom'>('quick');
  const [customDate, setCustomDate] = useState(() => {
    const d = new Date(windowStart);
    return d.toISOString().split('T')[0];
  });
  const [customStartTime, setCustomStartTime] = useState(() => formatTime(windowStart).slice(0, 5));
  const [customEndTime, setCustomEndTime] = useState(() => formatTime(windowEnd).slice(0, 5));

  const now = getISTNow();
  const todayStr = now.toISOString().split('T')[0];
  const tomorrowStr = new Date(now.getTime() + 86400000).toISOString().split('T')[0];
  const maxDate = new Date(now.getTime() + maxAdvanceMinutes * 60000).toISOString().split('T')[0];

  const handleQuickSelect = (minutes: number) => {
    const start = new Date(now);
    const end = new Date(start.getTime() + minutes * 60000);
    onChange(start.toISOString(), end.toISOString());
  };

  const handleCustomChange = () => {
    if (!customDate || !customStartTime || !customEndTime) return;
    const start = parseLocalToIST(customDate, customStartTime);
    const end = parseLocalToIST(customDate, customEndTime);
    onChange(start, end);
  };

  const isValidCustom = useMemo(() => {
    if (!customDate || !customStartTime || !customEndTime) return false;
    const start = new Date(parseLocalToIST(customDate, customStartTime));
    const end = new Date(parseLocalToIST(customDate, customEndTime));
    const diff = (end.getTime() - start.getTime()) / 60000;
    return diff >= minWindowMinutes && diff <= maxWindowMinutes && start >= now && start <= new Date(now.getTime() + maxAdvanceMinutes * 60000);
  }, [customDate, customStartTime, customEndTime, minWindowMinutes, maxWindowMinutes, maxAdvanceMinutes]);

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-text">Time window</label>
      
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quick time windows">
        {QUICK_OPTIONS.map((opt) => (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={mode === 'quick' && windowEnd === new Date(new Date(windowStart).getTime() + opt.minutes * 60000).toISOString()}
            onClick={() => { setMode('quick'); handleQuickSelect(opt.minutes); }}
            disabled={disabled}
            className={`px-3 py-2 text-sm rounded-input border transition-all duration-100 ${
              mode === 'quick' ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text hover:border-accent/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {opt.label}
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'custom'}
          onClick={() => setMode('custom')}
          disabled={disabled}
          className={`px-3 py-2 text-sm rounded-input border transition-all duration-100 ${
            mode === 'custom' ? 'border-accent bg-accent/5 text-accent' : 'border-border text-text hover:border-accent/50'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Custom
        </button>
      </div>

      {mode === 'custom' && (
        <div className="space-y-3 p-4 border border-border rounded-input bg-gray-50 dark:bg-gray-900">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Date</label>
              <select
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-border rounded-input bg-white dark:bg-gray-800 text-text dark:text-dark-text focus:ring-1 focus:ring-accent"
              >
                <option value={todayStr}>Today</option>
                <option value={tomorrowStr}>Tomorrow</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Start time</label>
              <input
                type="time"
                value={customStartTime}
                onChange={(e) => setCustomStartTime(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-border rounded-input bg-white dark:bg-gray-800 text-text dark:text-dark-text focus:ring-1 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">End time</label>
              <input
                type="time"
                value={customEndTime}
                onChange={(e) => setCustomEndTime(e.target.value)}
                disabled={disabled}
                className="w-full px-3 py-2 border border-border rounded-input bg-white dark:bg-gray-800 text-text dark:text-dark-text focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleCustomChange}
            disabled={disabled || !isValidCustom}
            className="w-full py-2 px-3 text-sm font-medium text-accent border border-accent rounded-btn hover:bg-accent/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Set custom window
          </button>
        </div>
      )}

      <div className="text-xs text-text-secondary">
        Current: {formatDateTime(windowStart)} – {formatTime(windowEnd)}
      </div>
    </div>
  );
}