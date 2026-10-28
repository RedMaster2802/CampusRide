// web/src/components/Countdown.tsx
// Countdown timer

import { useState, useEffect } from 'react';
import { formatCountdown } from '../lib/time';

interface CountdownProps {
  target: string | Date;
  label?: string;
}

export function Countdown({ target, label = 'in' }: CountdownProps) {
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const update = () => setCountdown(formatCountdown(target));
    update();
    const interval = setInterval(update, 30000); // Update every 30s
    return () => clearInterval(interval);
  }, [target]);

  return (
    <div className="text-lg font-medium text-text flex items-center gap-1">
      {label} {countdown}
    </div>
  );
}