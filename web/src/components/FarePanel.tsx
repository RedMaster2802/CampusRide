// web/src/components/FarePanel.tsx
// Fare breakdown panel

interface FarePanelProps {
  fareTotal: number;
  farePerSeat: number | null;
  myFare: number | null;
  partySize: number;
}

export function FarePanel({ fareTotal, farePerSeat, myFare, partySize }: FarePanelProps) {
  if (!fareTotal || fareTotal === 0) return null;

  return (
    <div className="p-4 border border-border rounded-input bg-gray-50 dark:bg-gray-900 space-y-2">
      <h3 className="text-sm font-medium text-text">Estimated fare</h3>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-text-secondary">Total (cab)</span>
          <span className="font-medium text-text">₹{fareTotal}</span>
        </div>
        {farePerSeat && (
          <div className="flex justify-between">
            <span className="text-text-secondary">Per seat</span>
            <span className="font-medium text-text">₹{farePerSeat}</span>
          </div>
        )}
        {myFare && (
          <div className="flex justify-between border-t border-border pt-2">
            <span className="font-medium text-text">Your share ({partySize} seat{partySize > 1 ? 's' : ''})</span>
            <span className="font-medium text-text">₹{myFare}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-text-secondary mt-2">
        Estimate only. Pay your co-riders directly.
      </p>
    </div>
  );
}