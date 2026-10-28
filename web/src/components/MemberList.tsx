// web/src/components/MemberList.tsx
// Member list with arrived status and phone

import type { Member } from '../types/contract';
import { chatLink } from '../lib/whatsapp';

interface MemberListProps {
  members: Member[];
  currentUserId: string;
  onArrivedChange?: (userId: string, arrived: boolean) => void;
  showArrived?: boolean;
  showPhone?: boolean;
}

export function MemberList({ members, currentUserId, onArrivedChange, showArrived = true, showPhone = true }: MemberListProps) {
  if (members.length === 0) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <h3 className="text-sm font-medium text-text">Members</h3>
      <ul className="space-y-2" role="list">
        {members.map((member) => (
          <li key={member.user_id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-900 rounded-input">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center">
                <span className="text-sm font-medium text-accent">
                  {member.full_name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-text flex items-center gap-2">
                  {member.full_name}
                  {member.is_me && <span className="text-xs text-text-secondary">(you)</span>}
                </p>
                <p className="text-xs text-text-secondary">{member.seats} seat{member.seats > 1 ? 's' : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {showArrived && (
                <label className="flex items-center gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    checked={member.arrived}
                    onChange={(e) => onArrivedChange?.(member.user_id, e.target.checked)}
                    className="w-4 h-4 text-accent border-border rounded focus:ring-accent"
                    disabled={member.is_me ? false : true}
                  />
                  At meeting point
                </label>
              )}
              {showPhone && member.phone && (
                <a
                  href={chatLink(member.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline"
                >
                  WhatsApp
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}