import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../components/common/ProtectedRoute';
import { RoleProtectedRoute } from '../components/common/RoleProtectedRoute';
import { Layout } from '../components/layout/Layout';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { AdminPage } from '../pages/AdminPage';
import { AdminDashboardPage } from '../pages/AdminDashboardPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { HomePage } from '../pages/HomePage';
import { IssueDetailPage } from '../pages/IssueDetailPage';
import { IssuesPage } from '../pages/IssuesPage';
import { CreateIssuePage } from '../pages/CreateIssuePage';
import { ProfilePage } from '../pages/ProfilePage';
import { ProjectsPage } from '../pages/ProjectsPage';
import { TesterDashboardPage } from '../pages/TesterDashboardPage';
import { TesterIssuesPage } from '../pages/TesterIssuesPage';
import { SprintsPage } from '../pages/SprintsPage';
import { BacklogPage } from '../pages/BacklogPage';

export const AppRoutes: React.FC = () => {
  return (
    <BrowserRouter>
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
    </BrowserRouter>
  );
};
