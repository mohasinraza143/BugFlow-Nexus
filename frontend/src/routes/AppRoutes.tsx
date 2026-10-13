import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { RoleProtectedRoute } from '../components/common/RoleProtectedRoute';
const Layout = lazy(() => import('../components/layout/Layout').then(m => ({ default: m.Layout })));
import { LoadingSpinner } from '../components/common/LoadingSpinner';

import { HomePage } from '../pages/HomePage';
const LoginPage = lazy(() => import('../pages/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage').then(m => ({ default: m.RegisterPage })));
const DashboardPage = lazy(() => import('../pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => import('../pages/ProjectsPage').then(m => ({ default: m.ProjectsPage })));
const IssuesPage = lazy(() => import('../pages/IssuesPage').then(m => ({ default: m.IssuesPage })));
const CreateIssuePage = lazy(() => import('../pages/CreateIssuePage').then(m => ({ default: m.CreateIssuePage })));
const IssueDetailPage = lazy(() => import('../pages/IssueDetailPage').then(m => ({ default: m.IssueDetailPage })));
const SprintsPage = lazy(() => import('../pages/SprintsPage').then(m => ({ default: m.SprintsPage })));
const BacklogPage = lazy(() => import('../pages/BacklogPage').then(m => ({ default: m.BacklogPage })));
const AnalyticsPage = lazy(() => import('../pages/AnalyticsPage').then(m => ({ default: m.AnalyticsPage })));
const ProfilePage = lazy(() => import('../pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const AdminPage = lazy(() => import('../pages/AdminPage').then(m => ({ default: m.AdminPage })));
const AdminDashboardPage = lazy(() => import('../pages/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const TesterDashboardPage = lazy(() => import('../pages/TesterDashboardPage').then(m => ({ default: m.TesterDashboardPage })));
const TesterIssuesPage = lazy(() => import('../pages/TesterIssuesPage').then(m => ({ default: m.TesterIssuesPage })));

const RouteFallback: React.FC = () => (
  <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <LoadingSpinner message="Loading BugFlow..." />
  </div>
);

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public Landing & Authentication Routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Authenticated Protected Application Routes */}
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/issues" element={<IssuesPage />} />
              <Route path="/create-issue" element={<CreateIssuePage />} />
              <Route path="/issues/:id" element={<IssueDetailPage />} />
              <Route path="/projects/:id/sprints" element={<SprintsPage />} />
              <Route path="/projects/:id/backlog" element={<BacklogPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/profile" element={<ProfilePage />} />

              {/* Admin-only Protected Route */}
              <Route element={<RoleProtectedRoute allowedRoles={['ADMIN']} />}>
                <Route path="/admin" element={<AdminPage />} />
                <Route path="/admin-dashboard" element={<AdminDashboardPage />} />
              </Route>

              {/* Tester / Developer Protected Routes */}
              <Route element={<RoleProtectedRoute allowedRoles={['TESTER', 'DEVELOPER']} />}>
                <Route path="/tester-dashboard" element={<TesterDashboardPage />} />
                <Route path="/tester-issues" element={<TesterIssuesPage />} />
              </Route>
            </Route>
          </Route>

          {/* Catch-all Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};
