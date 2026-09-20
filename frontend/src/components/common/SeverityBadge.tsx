import React from 'react';
import type { Severity } from '../../types/issue';

interface SeverityBadgeProps {
  severity: Severity | string;
}

export const SeverityBadge: React.FC<SeverityBadgeProps> = ({ severity }) => {
  return (
    <span className={`badge badge-severity-${severity}`}>
      {severity}
    </span>
  );
};
