import React from 'react';
import type { Priority } from '../../types/issue';

interface PriorityBadgeProps {
  priority: Priority | string;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({ priority }) => {
  return (
    <span className={`badge badge-priority-${priority}`}>
      ● {priority}
    </span>
  );
};
