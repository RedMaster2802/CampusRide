// web/src/components/SeatsBar.tsx
// Seats progress bar

interface SeatsBarProps {
  seatsTaken: number;
  capacity: number;
}

export function SeatsBar({ seatsTaken, capacity }: SeatsBarProps) {
  const percent = (seatsTaken / capacity) * 100;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-text">{seatsTaken} of {capacity} seats</span>
        <span className="text-text-secondary">{Math.round(percent)}%</span>
      </div>
      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}