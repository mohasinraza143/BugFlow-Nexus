import React from 'react';

interface LoadingSpinnerProps {
  message?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
}) => {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      {message && <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{message}</p>}
    </div>
  );
};
