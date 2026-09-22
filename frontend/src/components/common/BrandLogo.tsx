import React from 'react';

interface BrandLogoProps {
  size?: number;
  showText?: boolean;
  showTagline?: boolean;
  edition?: string;
  className?: string;
}

/**
 * High-Tech BugFlow-Nexus Brand Logo Component
 * - Styled according to the selected "‘BugFlow-Nexus | AGILE QUALITY INTELLIGENCE" aesthetic
 * - Metallic platinum ‘BugFlow + Emerald Green "Ne" + Radiant Saffron "x" + Emerald "us"
 * - Indian Tricolor Cyber Shield Vector Mark
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 36,
  showText = true,
  showTagline = false,
  className = '',
}) => {
  return (
    <div
      className={`brand-logo-component ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.65rem',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Nexus Flow 'N' Icon */}
      <div
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <svg
          width={Math.round(size * 0.9)}
          height={Math.round(size * 0.9)}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="nexusGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#0033cc" />
              <stop offset="35%" stopColor="#00ccff" />
              <stop offset="70%" stopColor="#ff9900" />
              <stop offset="100%" stopColor="#0055ff" />
            </linearGradient>
          </defs>
          <path
            d="M 5 17 L 5 9 C 5 7 6 6 7 7 L 17 17 C 18 18 19 17 19 15 L 19 7"
            stroke="url(#nexusGrad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="5" cy="19" r="1.5" stroke="url(#nexusGrad)" strokeWidth="2.5" fill="none" />
          <circle cx="19" cy="5" r="1.5" stroke="url(#nexusGrad)" strokeWidth="2.5" fill="none" />
        </svg>
      </div>

      {showText && (
        <div className="brand-title-wrap">
          <div className="brand-title-row" style={{ fontSize: `${Math.max(1.15, size * 0.038)}rem` }}>
            <span className="brand-tick">‘</span>
            <span className="brand-bf-text">BugFlow</span>
            <span className="brand-hyphen">-</span>
            <span className="brand-ne-text">Ne</span>
            <span className="brand-x-text">x</span>
            <span className="brand-us-text">us</span>
          </div>
          {showTagline && (
            <span className="brand-tagline-text">AGILE QUALITY INTELLIGENCE</span>
          )}
        </div>
      )}
    </div>
  );
};

/** Reusable Exact Typography Text Span */
export const BrandText: React.FC<{
  className?: string;
  size?: string;
  withTagline?: boolean;
}> = ({ className = '', size, withTagline = false }) => {
  return (
    <span className={`brand-title-wrap ${className}`} style={size ? { fontSize: size } : undefined}>
      <span className="brand-title-row">
        <span className="brand-tick">‘</span>
        <span className="brand-bf-text">BugFlow</span>
        <span className="brand-hyphen">-</span>
        <span className="brand-ne-text">Ne</span>
        <span className="brand-x-text">x</span>
        <span className="brand-us-text">us</span>
      </span>
      {withTagline && <span className="brand-tagline-text">AGILE QUALITY INTELLIGENCE</span>}
    </span>
  );
};

export default BrandLogo;
