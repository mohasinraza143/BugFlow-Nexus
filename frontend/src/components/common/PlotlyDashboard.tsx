/**
 * PlotlyDashboard — Milestone 3 interactive Plotly.js charts
 *
 * Charts:
 *  1. Defect Trend Line Chart  — last 14 days, new vs resolved
 *  2. Severity Donut Chart     — CRITICAL / MAJOR / MINOR / TRIVIAL
 *  3. Workflow Pipeline Bar    — per-status issue counts
 */
import React, { useEffect, useState } from 'react';
// @ts-ignore — react-plotly.js ships JS only; types are in @types/react-plotly.js (optional)
import Plot from 'react-plotly.js';
import { analyticsApi } from '../../api/analytics';
import { getApiErrorMessage } from '../../api/client';
import { LoadingSpinner } from './LoadingSpinner';
import type { PlotlyChartsData } from '../../types/analytics';

interface Props {
  /** Optional dark-mode class override */
  darkMode?: boolean;
}

const PLOTLY_PAPER_BG = 'rgba(0,0,0,0)';
const PLOTLY_PLOT_BG  = 'rgba(0,0,0,0)';
const FONT_COLOUR     = '#94a3b8';
const GRID_COLOUR     = 'rgba(148,163,184,0.15)';

const SEVERITY_COLOURS: Record<string, string> = {
  BLOCKER:  '#dc2626',
  CRITICAL: '#f87171',
  MAJOR:    '#fbbf24',
  MINOR:    '#60a5fa',
  TRIVIAL:  '#94a3b8',
};

const STATUS_COLOURS: Record<string, string> = {
  REPORTED:         '#818cf8',
  TRIAGED:          '#a78bfa',
  IN_DEVELOPMENT:   '#fbbf24',
  IN_REVIEW:        '#fb923c',
  IN_TESTING:       '#34d399',
  RESOLVED:         '#22c55e',
  CLOSED:           '#64748b',
  REOPENED:         '#f87171',
};

export const PlotlyDashboard: React.FC<Props> = () => {
  const [data, setData] = useState<PlotlyChartsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    analyticsApi.getPlotlyCharts()
      .then(setData)
      .catch((err) => setError(getApiErrorMessage(err)))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) return <LoadingSpinner message="Loading interactive charts..." />;
  if (error || !data) {
    return (
      <div style={{ color: '#f87171', padding: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>
        ⚠ {error ?? 'Chart data unavailable'}
      </div>
    );
  }

  // ── 1. Defect Trend Line Chart ─────────────────────────────────────────────
  const trendTraces = [
    {
      x: data.defect_trends.dates,
      y: data.defect_trends.created,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: 'New Bugs',
      line: { color: '#f87171', width: 2.5, shape: 'spline' as const },
      marker: { color: '#f87171', size: 6 },
      hovertemplate: '<b>%{x}</b><br>New: %{y}<extra></extra>',
    },
    {
      x: data.defect_trends.dates,
      y: data.defect_trends.resolved,
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      name: 'Resolved',
      line: { color: '#34d399', width: 2.5, shape: 'spline' as const },
      marker: { color: '#34d399', size: 6 },
      hovertemplate: '<b>%{x}</b><br>Resolved: %{y}<extra></extra>',
    },
  ];

  // ── 2. Severity Donut Chart ───────────────────────────────────────────────
  const sevKeys = Object.keys(data.severity_distribution);
  const sevValues = sevKeys.map((k) => data.severity_distribution[k]);
  const sevColours = sevKeys.map((k) => SEVERITY_COLOURS[k] ?? '#94a3b8');

  const donutTrace = [
    {
      labels: sevKeys,
      values: sevValues,
      type: 'pie' as const,
      hole: 0.55,
      marker: { colors: sevColours },
      textinfo: 'label+percent' as const,
      hovertemplate: '<b>%{label}</b><br>Count: %{value}<br>%{percent}<extra></extra>',
      textfont: { color: '#e2e8f0', size: 13 },
    },
  ];

  // ── 3. Workflow Pipeline Bar Chart ────────────────────────────────────────
  const wfKeys = Object.keys(data.workflow_pipeline);
  const wfValues = wfKeys.map((k) => data.workflow_pipeline[k]);
  const wfColours = wfKeys.map((k) => STATUS_COLOURS[k] ?? '#818cf8');

  const barTrace = [
    {
      x: wfKeys.map((k) => k.replace(/_/g, ' ')),
      y: wfValues,
      type: 'bar' as const,
      marker: {
        color: wfColours,
        line: { color: 'rgba(0,0,0,0.2)', width: 1 },
      },
      hovertemplate: '<b>%{x}</b><br>Count: %{y}<extra></extra>',
      text: wfValues.map(String),
      textposition: 'outside' as const,
      textfont: { color: '#e2e8f0', size: 12 },
    },
  ];

  const commonLayout = {
    paper_bgcolor: PLOTLY_PAPER_BG,
    plot_bgcolor: PLOTLY_PLOT_BG,
    font: { color: FONT_COLOUR, family: 'Inter, system-ui, sans-serif', size: 12 },
    margin: { t: 36, b: 48, l: 48, r: 16 },
    legend: { font: { color: '#e2e8f0' } },
    xaxis: { gridcolor: GRID_COLOUR, linecolor: GRID_COLOUR, tickfont: { color: FONT_COLOUR } },
    yaxis: { gridcolor: GRID_COLOUR, linecolor: GRID_COLOUR, tickfont: { color: FONT_COLOUR } },
  };

  const plotConfig = {
    displayModeBar: true,
    modeBarButtonsToRemove: ['sendDataToCloud', 'select2d', 'lasso2d'] as any[],
    responsive: true,
    displaylogo: false,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Defect Trend Line Chart */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            📈 Defect Trend — Last 14 Days
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Hover for values · Scroll to zoom · Drag to pan
          </span>
        </div>
        <div className="card-body" style={{ padding: '0.5rem' }}>
          <Plot
            data={trendTraces as any}
            layout={{
              ...commonLayout,
              title: { text: '', font: { color: FONT_COLOUR } },
              xaxis: { ...commonLayout.xaxis, title: { text: 'Date', font: { color: FONT_COLOUR } } },
              yaxis: { ...commonLayout.yaxis, title: { text: 'Issue Count', font: { color: FONT_COLOUR } } },
              hovermode: 'x unified' as const,
            }}
            config={plotConfig}
            style={{ width: '100%', minHeight: '320px' }}
            useResizeHandler
          />
        </div>
      </div>

      {/* Severity Donut + Workflow Bar side-by-side */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

        {/* Severity Donut */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">🍩 Severity Distribution</h3>
          </div>
          <div className="card-body" style={{ padding: '0.5rem' }}>
            <Plot
              data={donutTrace as any}
              layout={{
                ...commonLayout,
                margin: { t: 20, b: 20, l: 20, r: 20 },
                showlegend: true,
                legend: { orientation: 'v' as const, font: { color: '#e2e8f0', size: 11 } },
              }}
              config={plotConfig}
              style={{ width: '100%', minHeight: '280px' }}
              useResizeHandler
            />
          </div>
        </div>

        {/* Workflow Pipeline Bar */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📊 Workflow Pipeline</h3>
          </div>
          <div className="card-body" style={{ padding: '0.5rem' }}>
            <Plot
              data={barTrace as any}
              layout={{
                ...commonLayout,
                margin: { t: 20, b: 72, l: 48, r: 16 },
                xaxis: {
                  ...commonLayout.xaxis,
                  tickangle: -35,
                  title: { text: 'Status', font: { color: FONT_COLOUR } },
                },
                yaxis: {
                  ...commonLayout.yaxis,
                  title: { text: 'Issues', font: { color: FONT_COLOUR } },
                },
              }}
              config={plotConfig}
              style={{ width: '100%', minHeight: '280px' }}
              useResizeHandler
            />
          </div>
        </div>

      </div>
    </div>
  );
};
