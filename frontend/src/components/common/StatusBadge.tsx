import React from 'react';
import type { IssueStatus } from '../../types/issue';
import { formatStatusLabel } from '../../utils/formatters';

interface StatusBadgeProps {
  status: IssueStatus | string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  return (
    <span className={`badge badge-status-${status}`}>
      {formatStatusLabel(status)}
    </span>
  );
};
