import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

export const Layout: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState<boolean>(false);

  return (
    <div className="app-container">
      <Sidebar
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="main-wrapper">
        <Header onToggleMobile={() => setMobileOpen((prev) => !prev)} />
        <main className="page-content">
          <Outlet />
        </main>
        <footer style={{
          textAlign: 'center',
          padding: '1.25rem',
          color: 'var(--text-muted)',
          fontSize: '0.85rem',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 'auto',
          backgroundColor: 'transparent'
        }}>
          Mohsin Raza © 2026 BugFlow-Nexus Technologies Inc. All rights reserved.
        </footer>
      </div>
    </div>
  );
};
