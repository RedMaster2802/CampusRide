// web/src/pages/Dev.tsx
// Dev page for mock mode simulation

import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api';
import { mockDevSetConfig, mockDevGetState } from '../api/mock';
import { Button } from '../components/Button';
import { Banner } from '../components/Banner';
import { toast } from 'sonner';

export function Dev() {
  const { user } = useAuth();
  const [simState, setSimState] = useState<'idle' | 'queued' | 'filling' | 'confirmed' | 'expired' | 'rate_limited' | 'maintenance' | 'offline' | 'slow'>('idle');
  const [slowDelay, setSlowDelay] = useState(3000);

  const isMock = import.meta.env.VITE_USE_MOCK === 'true';

  if (!isMock) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <Banner type="info" message="Dev page only available in mock mode (VITE_USE_MOCK=true)" />
      </div>
    );
  }

  const runSimulation = async (state: typeof simState) => {
    setSimState(state);
    
    switch (state) {
      case 'queued':
        mockDevSetConfig('maintenance_mode', false);
        break;
      case 'filling':
        mockDevSetConfig('maintenance_mode', false);
        // Create a pool with 2/4 seats
        break;
      case 'confirmed':
        mockDevSetConfig('maintenance_mode', false);
        break;
      case 'expired':
        mockDevSetConfig('maintenance_mode', false);
        break;
      case 'rate_limited':
        break;
      case 'maintenance':
        mockDevSetConfig('maintenance_mode', true);
        break;
      case 'offline':
        // Handled by service worker
        break;
      case 'slow':
        // Would need to wrap api calls
        break;
    }
    toast.success(`Simulation set to ${state}`);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-6">
      <h1 className="text-2xl font-semibold text-text">Dev Simulation</h1>
      <p className="text-text-secondary text-sm">Only works in mock mode</p>

      <div className="space-y-3">
        <h3 className="font-medium text-text">Pool States</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['queued', 'filling', 'confirmed', 'expired'] as const).map((state) => (
            <Button
              key={state}
              variant={simState === state ? 'primary' : 'secondary'}
              onClick={() => runSimulation(state)}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-text">Error States</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['rate_limited', 'maintenance'] as const).map((state) => (
            <Button
              key={state}
              variant={simState === state ? 'destructive' : 'secondary'}
              onClick={() => runSimulation(state)}
            >
              {state.replace('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium text-text">Network Simulation</h3>
        <div className="grid grid-cols-2 gap-2">
          {(['offline', 'slow'] as const).map((state) => (
            <Button
              key={state}
              variant={simState === state ? 'secondary' : 'secondary'}
              onClick={() => runSimulation(state)}
            >
              {state.charAt(0).toUpperCase() + state.slice(1)}
            </Button>
          ))}
        </div>
        {simState === 'slow' && (
          <div className="space-y-2">
            <label className="block text-sm text-text-secondary">Delay (ms)</label>
            <input
              type="number"
              value={slowDelay}
              onChange={(e) => setSlowDelay(Number(e.target.value))}
              min={100}
              max={10000}
              step={100}
              className="w-full px-3 py-2 border border-border rounded-input text-text bg-white dark:bg-gray-800"
            />
          </div>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <h3 className="font-medium text-text mb-2">Current Mock State</h3>
        <pre className="text-xs text-text-secondary bg-gray-100 dark:bg-gray-900 p-4 rounded-input overflow-auto max-h-64">
          {JSON.stringify(mockDevGetState(), null, 2)}
        </pre>
      </div>
    </div>
  );
}