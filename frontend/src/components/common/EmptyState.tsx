import React from 'react';
import { Inbox } from 'lucide-react';

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No items found',
  description = 'There are no records to display at this time.',
  action,
  icon,
}) => {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        {icon || <Inbox size={48} />}
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {action && <div style={{ marginTop: '1rem' }}>{action}</div>}
    </div>
  );
};
