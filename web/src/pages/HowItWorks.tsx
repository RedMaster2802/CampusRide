// web/src/pages/HowItWorks.tsx
// How it works page

import { PLACES, PLACE_LABEL } from '../types/contract';
import { EmptyState } from '../components/EmptyState';

export function HowItWorks() {
  const steps = [
    {
      number: 1,
      title: 'Enter your trip',
      description: 'Pick where you\'re going from and to, how many people, what size cab you want, and when you want to leave.',
    },
    {
      number: 2,
      title: 'We find your pool',
      description: 'The system matches you with other students going the same way at the same time. You\'ll see the pool fill up in real time.',
    },
    {
      number: 3,
      title: 'Pool confirms',
      description: 'When the cab is full (or at the fallback deadline if enough people joined), everyone gets a meeting point and time.',
    },
    {
      number: 4,
      title: 'Ride together',
      description: 'One person books the cab. The app shows the fare split. Pay your co-riders directly. Mark arrived when you\'re at the meeting point.',
    },
  ];

  const examples = [
    'Four singles (1,1,1,1) with target 4 and overlapping windows → one 4-seat pool, confirmed when the 4th joins.',
    '2 + 1 + 1 → full. 3 + 1 → full.',
    'Target 6: 3 + 2 + 1 → one 6-seat pool, confirmed.',
    '"ANY" single arrives when a 6-seat pool has 3 seats left and a 4-seat pool has 1 seat left → joins the 4-seat pool (fewest seats left after joining = 0).',
    'Windows that do not overlap by 15 minutes → separate pools.',
    '2 riders only, deadline reached → pool expires, both told, "Search again" button.',
    'Sector 128 → OBS and Sector 128 → Botanical Metro requests with overlapping windows → two separate pools (different destination).',
    'OBS → Sector 62 and Sector 62 → OBS → two separate pools (different direction).',
    'OBS → OBS → error (pick two different places).',
  ];

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold text-text">How it works</h1>

      <div className="space-y-6">
        {steps.map((step) => (
          <div key={step.number} className="flex gap-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center font-medium text-sm">
              {step.number}
            </div>
            <div>
              <h3 className="font-medium text-text">{step.title}</h3>
              <p className="text-text-secondary text-sm mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-6 space-y-4">
        <h2 className="font-medium text-text">Matching examples</h2>
        <ul className="space-y-2 text-sm text-text-secondary">
          {examples.map((ex, i) => (
            <li key={i} className="flex gap-2">
              <span className="flex-shrink-0">•</span>
              <span>{ex}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-border pt-6">
        <h2 className="font-medium text-text mb-3">Places</h2>
        <ul className="space-y-1 text-sm text-text-secondary">
          {PLACES.map((place) => (
            <li key={place} className="flex gap-2">
              <span className="flex-shrink-0">•</span>
              <span>{PLACE_LABEL[place]}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}