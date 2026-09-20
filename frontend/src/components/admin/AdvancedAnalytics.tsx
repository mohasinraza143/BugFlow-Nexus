import React, { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { Clock, AlertOctagon, AlertTriangle, CheckCircle, CircleDot, Bug, TrendingUp, Download, ChevronDown } from 'lucide-react';
import { analyticsApi, type AnalyticsFilterParams, type TrendFilterParams } from '../../api/analytics';
import { useAuth } from '../../hooks/useAuth';
import { generateAnalyticsPdfReport } from '../../utils/pdfGenerator';
import type { 
  SystemAnalyticsResponse, 
  IssueTrendResponse, 
  IssueStatusDistributionResponse, 
  SeverityDistributionResponse,
  PriorityDistributionResponse,
  DeveloperAnalyticsResponse 
} from '../../types/analytics';
import { LoadingSpinner } from '../common/LoadingSpinner';

type Period = 'today' | '7d' | '30d';

export const AdvancedAnalytics: React.FC = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  
  // Data states
  const [overview, setOverview] = useState<SystemAnalyticsResponse | null>(null);
  const [trends, setTrends] = useState<IssueTrendResponse | null>(null);
  const [statusDist, setStatusDist] = useState<IssueStatusDistributionResponse | null>(null);
  const [severityDist, setSeverityDist] = useState<SeverityDistributionResponse | null>(null);
  const [priorityDist, setPriorityDist] = useState<PriorityDistributionResponse | null>(null);
  const [workload, setWorkload] = useState<DeveloperAnalyticsResponse | null>(null);

  const fetchAnalytics = async (selectedPeriod: Period) => {
    setIsLoading(true);
    try {
      const now = new Date();
      let startDateStr: string;
      const endDateStr = now.toISOString();
      let interval: 'day' | 'week' | 'month' = 'day';

      if (selectedPeriod === 'today') {
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        startDateStr = yesterday.toISOString();
        interval = 'day'; // ideally hourly, but 'day' will just show the single day point
      } else if (selectedPeriod === '7d') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        startDateStr = lastWeek.toISOString();
        interval = 'day';
      } else {
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        startDateStr = lastMonth.toISOString();
        interval = 'day';
      }

      const params: AnalyticsFilterParams = {
        start_date: startDateStr,
        end_date: endDateStr,
      };

      const trendParams: TrendFilterParams = {
        ...params,
        interval,
      };

      const [
        overviewData,
        trendData,
        statusData,
        severityData,
        priorityData,
        workloadData
      ] = await Promise.all([
        analyticsApi.getSystemOverview(params),
        analyticsApi.getTrends(trendParams),
        analyticsApi.getStatusDistribution(params),
        analyticsApi.getSeverityDistribution(params),
        analyticsApi.getPriorityDistribution(params),
        analyticsApi.getDeveloperPerformance(params),
      ]);

      setOverview(overviewData);
      setTrends(trendData);
      setStatusDist(statusData);
      setSeverityDist(severityData);
      setPriorityDist(priorityData);
      setWorkload(workloadData);
    } catch (err) {
      console.error('Failed to load advanced analytics', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics(period);
  }, [period]);

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1', '#64748b'];
  const SEVERITY_COLORS = { CRITICAL: '#ef4444', BLOCKER: '#dc2626', MAJOR: '#f97316', MINOR: '#3b82f6' };
  const PRIORITY_COLORS = { URGENT: '#dc2626', HIGH: '#f97316', MEDIUM: '#eab308', LOW: '#3b82f6' };

  const handleDownloadReport = async (downloadPeriod: '1d' | '7d' | '30d', label: string) => {
    if (isDownloading) return;
    setIsDownloading(downloadPeriod);
    setDownloadError(null);
    setShowDropdown(false);
    
    try {
      const data = await analyticsApi.downloadReport(downloadPeriod);
      generateAnalyticsPdfReport({
        user: user || null,
        statusDist: data.status_distribution,
        severityDist: data.severity_distribution,
        priorityDist: data.priority_distribution,
        projectAnalytics: data.project_analytics,
        devAnalytics: data.developer_performance,
        systemOverview: data.system_overview,
        trends: data.trends,
        periodLabel: label,
        generatedAt: data.generated_at
      });
    } catch (err) {
      console.error('Failed to download report', err);
      setDownloadError('Failed to generate report. Please try again.');
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <div style={{ marginTop: '3rem', borderTop: '1px solid var(--border-subtle)', paddingTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={24} color="var(--primary)" />
            Advanced Analytics & Reporting
          </h2>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.2rem' }}>
            Detailed metrics and trends calculated from live data.
          </p>
        </div>
        
        {/* Period Selector & Download */}
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          
          <div style={{ display: 'flex', background: 'var(--bg-surface-elevated)', borderRadius: '8px', padding: '0.25rem', border: '1px solid var(--border-subtle)' }}>
            <button
              onClick={() => setPeriod('today')}
              style={{ 
                padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                background: period === 'today' ? 'var(--primary)' : 'transparent',
                color: period === 'today' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              Today
            </button>
            <button
              onClick={() => setPeriod('7d')}
              style={{ 
                padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                background: period === '7d' ? 'var(--primary)' : 'transparent',
                color: period === '7d' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              7 Days
            </button>
            <button
              onClick={() => setPeriod('30d')}
              style={{ 
                padding: '0.4rem 1rem', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '600',
                background: period === '30d' ? 'var(--primary)' : 'transparent',
                color: period === '30d' ? '#fff' : 'var(--text-secondary)'
              }}
            >
              30 Days
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              disabled={!!isDownloading}
              className="btn btn-secondary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', opacity: isDownloading ? 0.7 : 1 }}
            >
              {isDownloading ? <LoadingSpinner message="" /> : <Download size={16} />}
              <span>{isDownloading ? 'Generating...' : 'Download Report'}</span>
              <ChevronDown size={14} />
            </button>

            {showDropdown && !isDownloading && (
              <div 
                style={{ 
                  position: 'absolute', top: '100%', right: 0, marginTop: '0.5rem', 
                  background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', 
                  borderRadius: '8px', padding: '0.5rem', zIndex: 50, minWidth: '180px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
                }}
              >
                <div style={{ padding: '0.5rem', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Generate PDF
                </div>
                <button
                  onClick={() => handleDownloadReport('1d', '1 Day')}
                  style={{ display: 'flex', width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', borderRadius: '4px' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Download size={14} style={{ marginRight: '0.5rem' }} /> 1 Day Report
                </button>
                <button
                  onClick={() => handleDownloadReport('7d', '1 Week')}
                  style={{ display: 'flex', width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', borderRadius: '4px' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Download size={14} style={{ marginRight: '0.5rem' }} /> 1 Week Report
                </button>
                <button
                  onClick={() => handleDownloadReport('30d', '1 Month')}
                  style={{ display: 'flex', width: '100%', padding: '0.5rem', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', textAlign: 'left', borderRadius: '4px' }}
                  onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <Download size={14} style={{ marginRight: '0.5rem' }} /> 1 Month Report
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {downloadError && (
        <div style={{ background: 'var(--bg-danger-subtle)', color: 'var(--text-danger)', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
          {downloadError}
        </div>
      )}

      {isLoading ? (
        <div style={{ minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LoadingSpinner message="Calculating analytics..." />
        </div>
      ) : overview && trends && statusDist && severityDist && workload ? (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #3b82f6' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Bug size={14}/> Total Issues</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.total_issues}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CircleDot size={14}/> Open</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.open_issues}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #8b5cf6' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><Clock size={14}/> In Progress</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.in_progress_issues}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #10b981' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><CheckCircle size={14}/> Resolved</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.resolved_issues}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #ef4444' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><AlertOctagon size={14}/> Critical</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.critical_issues}</div>
            </div>
            <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #f97316' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}><AlertTriangle size={14}/> High Priority</div>
              <div style={{ fontSize: '1.8rem', fontWeight: '700' }}>{overview.high_issues}</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem', marginBottom: '1.5rem' }}>
            
            {/* Trend Chart */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Issue Trend</h3>
              {trends.items.length === 0 ? (
                <div className="empty-state" style={{ minHeight: '300px' }}>No trend data for this period</div>
              ) : (
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trends.items} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorCreated" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorResolved" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                      <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} tickFormatter={(val) => new Date(val).toLocaleDateString()} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                        labelFormatter={(val) => new Date(val as string | number).toLocaleDateString()}
                      />
                      <Legend />
                      <Area type="monotone" name="Created" dataKey="created_count" stroke="#ef4444" fillOpacity={1} fill="url(#colorCreated)" />
                      <Area type="monotone" name="Resolved" dataKey="resolved_count" stroke="#10b981" fillOpacity={1} fill="url(#colorResolved)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Workload Chart */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>Tester Workload</h3>
              {workload.items.length === 0 ? (
                <div className="empty-state" style={{ minHeight: '300px' }}>No workload data for this period</div>
              ) : (
                <div style={{ height: '300px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={workload.items} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-subtle)" />
                      <XAxis dataKey="developer_name" tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                      <YAxis tick={{ fontSize: 12, fill: 'var(--text-secondary)' }} />
                      <RechartsTooltip cursor={{ fill: 'var(--bg-surface-elevated)' }} contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}/>
                      <Legend />
                      <Bar dataKey="assigned_issues" name="Assigned" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="resolved_issues" name="Resolved" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.5rem' }}>
            
            {/* Status Pie */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'center' }}>Issues by Status</h3>
              {Object.keys(statusDist).length === 0 ? (
                <div className="empty-state" style={{ minHeight: '200px' }}>No data</div>
              ) : (
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(statusDist).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value"
                      >
                        {Object.entries(statusDist).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Severity Pie */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'center' }}>Issues by Severity</h3>
              {Object.keys(severityDist).length === 0 ? (
                <div className="empty-state" style={{ minHeight: '200px' }}>No data</div>
              ) : (
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(severityDist).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value"
                      >
                        {Object.entries(severityDist).map(([name]) => (
                          <Cell key={`cell-${name}`} fill={SEVERITY_COLORS[name as keyof typeof SEVERITY_COLORS] || '#64748b'} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Priority Pie */}
            <div className="card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', textAlign: 'center' }}>Issues by Priority</h3>
              {Object.keys(priorityDist || {}).length === 0 ? (
                <div className="empty-state" style={{ minHeight: '200px' }}>No data</div>
              ) : (
                <div style={{ height: '250px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(priorityDist!).map(([name, value]) => ({ name, value }))}
                        cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value"
                      >
                        {Object.entries(priorityDist!).map(([name]) => (
                          <Cell key={`cell-${name}`} fill={PRIORITY_COLORS[name as keyof typeof PRIORITY_COLORS] || '#64748b'} />
                        ))}
                      </Pie>
                      <RechartsTooltip contentStyle={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

          </div>
        </>
      ) : (
        <div className="empty-state">Failed to load analytics data.</div>
      )}
    </div>
  );
};
