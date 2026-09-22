import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SprintService } from "../services/SprintService";
import { issuesApi } from "../api/issues";
import { usersApi } from "../api/users";
import type { Sprint, SprintAnalytics, SprintOverview } from "../types/Sprint";
import type { Issue } from "../types/issue";
import type { UserDetail } from "../types/user";
import { LoadingSpinner } from "../components/common/LoadingSpinner";
import { ErrorMessage } from "../components/common/ErrorMessage";
import { EmptyState } from "../components/common/EmptyState";
import { getApiErrorMessage } from "../api/client";
import { Modal } from "../components/common/Modal";
import { useAuth } from "../hooks/useAuth";
import {
  Plus,
  Download,
  Play,
  CheckCircle,
  Trash2,
  Calendar,
  Archive,
  AlertTriangle,
  TrendingUp,
  Activity,
  Users,
  Target,
  UserCheck,
  RotateCcw,
  Pencil,
  Search,
  Filter,
  CheckCheck,
  Clock,
  Zap,
} from "lucide-react";
import { formatDate } from "../utils/formatters";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  AreaChart,
  Area,
  ComposedChart,
} from "recharts";

const STATUS_COLORS: Record<string, string> = {
  open: "#6366f1",
  in_progress: "#f59e0b",
  resolved: "#10b981",
  closed: "#94a3b8",
};

const HEALTH_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ON_TRACK: { color: "#10b981", bg: "rgba(16,185,129,0.15)", label: "On Track" },
  AT_RISK: { color: "#f59e0b", bg: "rgba(245,158,11,0.15)", label: "At Risk" },
  OFF_TRACK: { color: "#ef4444", bg: "rgba(239,68,68,0.15)", label: "Off Track" },
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0f172a",
        border: "1px solid #334155",
        borderRadius: "10px",
        padding: "0.75rem 1rem",
        fontSize: "0.82rem",
        color: "#f8fafc",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}
    >
      {label && <div style={{ fontWeight: 700, marginBottom: "0.4rem", color: "#94a3b8" }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ color: "#94a3b8" }}>{p.name}:</span>
          <span style={{ fontWeight: 600 }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

const IssueCompositionChart: React.FC<{ analytics: SprintAnalytics }> = ({ analytics }) => {
  const allData = [
    { name: "Open", value: analytics.open_issues, color: STATUS_COLORS.open },
    { name: "In Progress", value: analytics.in_progress_issues, color: STATUS_COLORS.in_progress },
    { name: "Resolved", value: analytics.resolved_issues, color: STATUS_COLORS.resolved },
    { name: "Closed", value: analytics.closed_issues, color: STATUS_COLORS.closed },
  ];
  const chartData = allData.filter((d) => d.value > 0);
  const total = analytics.total_issues;

  if (total === 0) {
    return (
      <div
        style={{
          height: 200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        <Target size={32} style={{ marginBottom: "0.5rem", opacity: 0.4 }} />
        <span style={{ fontSize: "0.85rem" }}>No issues in sprint yet</span>
      </div>
    );
  }

  return (
    <div style={{ height: 200, display: "flex", alignItems: "center", gap: "1rem" }}>
      <ResponsiveContainer width="55%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            strokeWidth={0}
            paddingAngle={3}
          >
            {chartData.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", flex: 1 }}>
        {allData.map((d, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ width: 10, height: 10, borderRadius: "50%", background: d.color, flexShrink: 0 }} />
              <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>{d.name}</span>
            </div>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{d.value}</span>
              <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                ({total > 0 ? Math.round((d.value / total) * 100) : 0}%)
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const BurndownChartPanel: React.FC<{ analytics: SprintAnalytics; sprint: Sprint }> = ({
  analytics,
  sprint,
}) => {
  const hasData = analytics.burndown_points && analytics.burndown_points.length > 0;
  if (!hasData) {
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / 86400000));
    const total = analytics.total_issues || 0;
    const step = Math.max(1, Math.ceil(totalDays / 10));
    const idealPoints: { date: string; ideal: number }[] = [];
    for (let i = 0; i <= totalDays; i += step) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      idealPoints.push({
        date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ideal: Math.round(total - (total / totalDays) * i),
      });
    }
    return (
      <div>
        <div
          style={{
            marginBottom: "0.5rem",
            padding: "0.5rem 0.75rem",
            background: "rgba(99,102,241,0.1)",
            borderRadius: "6px",
            fontSize: "0.78rem",
            color: "#94a3b8",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <Activity size={13} />{" "}
          {total === 0
            ? "No issues assigned yet - chart updates as scope is added"
            : "Showing ideal trajectory - actual points appear as issues resolve"}
        </div>
        <div style={{ height: 210 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={idealPoints}>
              <defs>
                <linearGradient id="idealGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="date" stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} />
              <YAxis stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="ideal"
                stroke="#6366f1"
                strokeDasharray="6 3"
                strokeWidth={2}
                fill="url(#idealGrad)"
                name="Ideal Remaining"
                dot={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={analytics.burndown_points}>
          <defs>
            <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} />
          <YAxis stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "0.78rem", paddingTop: "6px", color: "#94a3b8" }} />
          <Line
            type="monotone"
            dataKey="ideal"
            stroke="#475569"
            strokeDasharray="6 3"
            name="Ideal"
            dot={false}
            strokeWidth={1.5}
          />
          <Area
            type="monotone"
            dataKey="remaining"
            stroke="#6366f1"
            strokeWidth={2.5}
            fill="url(#actualGrad)"
            name="Actual Remaining"
            dot={{ r: 3, fill: "#6366f1", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

const TeamWorkloadChart: React.FC<{ workload: SprintAnalytics["workload"] }> = ({ workload }) => {
  if (workload.length === 0) {
    return (
      <div
        style={{
          height: 200,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
        }}
      >
        <Users size={32} style={{ marginBottom: "0.5rem", opacity: 0.4 }} />
        <span style={{ fontSize: "0.85rem" }}>No workload data yet</span>
      </div>
    );
  }
  const data = workload.map((wl) => ({
    name: (wl.developer_name || "Unassigned").split(" ")[0],
    Completed: wl.completed_issues,
    "In Progress": wl.in_progress_issues,
    Open: wl.open_issues,
  }));
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={16}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} />
          <YAxis stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} allowDecimals={false} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "0.75rem", color: "#94a3b8" }} />
          <Bar dataKey="Completed" fill="#10b981" stackId="a" />
          <Bar dataKey="In Progress" fill="#f59e0b" stackId="a" />
          <Bar dataKey="Open" fill="#6366f1" stackId="a" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

const SprintComparisonChart: React.FC<{
  sprints: Sprint[];
  analytics: Record<number, SprintAnalytics>;
}> = ({ sprints, analytics }) => {
  const data = sprints
    .filter((s) => analytics[s.id])
    .map((s) => ({
      name: s.name.length > 14 ? s.name.slice(0, 13) + "..." : s.name,
      "Completion %": analytics[s.id].completion_rate,
      "Total Issues": analytics[s.id].total_issues,
      Completed: analytics[s.id].completed_issues,
    }));
  if (data.length === 0) return null;
  return (
    <div style={{ height: 180 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="name" stroke="#475569" fontSize={10} tick={{ fill: "#64748b" }} />
          <YAxis
            yAxisId="left"
            stroke="#475569"
            fontSize={10}
            tick={{ fill: "#64748b" }}
            allowDecimals={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#475569"
            fontSize={10}
            tick={{ fill: "#64748b" }}
            tickFormatter={(v) => `${v}%`}
            domain={[0, 100]}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "0.75rem", color: "#94a3b8" }} />
          <Bar
            yAxisId="left"
            dataKey="Total Issues"
            fill="#334155"
            barSize={12}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="left"
            dataKey="Completed"
            fill="#6366f1"
            barSize={12}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="Completion %"
            stroke="#10b981"
            strokeWidth={2}
            dot={{ r: 3, fill: "#10b981" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const SprintsPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [overview, setOverview] = useState<SprintOverview | null>(null);
  const [sprintIssues, setSprintIssues] = useState<Record<number, Issue[]>>({});
  const [analytics, setAnalytics] = useState<Record<number, SprintAnalytics>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestFetchRef = useRef(0);

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editSprintId, setEditSprintId] = useState<number | null>(null);
  const [formName, setFormName] = useState("");
  const [formGoal, setFormGoal] = useState("");
  const [formStart, setFormStart] = useState("");
  const [formEnd, setFormEnd] = useState("");
  const [formCapacityMembers, setFormCapacityMembers] = useState("");
  const [formCapacityDays, setFormCapacityDays] = useState("");
  const [formCapacityHours, setFormCapacityHours] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isCompleteOpen, setIsCompleteOpen] = useState(false);
  const [completeSprintId, setCompleteSprintId] = useState<number | null>(null);

  const [isExtendOpen, setIsExtendOpen] = useState(false);
  const [extendSprintId, setExtendSprintId] = useState<number | null>(null);
  const [formExtendEnd, setFormExtendEnd] = useState("");

  // Assign tester state
  const [isAssignTesterOpen, setIsAssignTesterOpen] = useState(false);
  const [assignTesterSprintId, setAssignTesterSprintId] = useState<number | null>(null);
  const [testerList, setTesterList] = useState<UserDetail[]>([]);
  const [selectedTesterId, setSelectedTesterId] = useState<number | "">("");
  const [assigningTester, setAssigningTester] = useState(false);

  const [isAddIssuesOpen, setIsAddIssuesOpen] = useState(false);
  const [addIssuesSprintId, setAddIssuesSprintId] = useState<number | null>(null);
  const [availableIssues, setAvailableIssues] = useState<Issue[]>([]);
  const [selectedIssueIds, setSelectedIssueIds] = useState<Set<number>>(new Set());
  const [loadingAvailableIssues, setLoadingAvailableIssues] = useState(false);
  const [addingIssues, setAddingIssues] = useState(false);
  const [addIssuesError, setAddIssuesError] = useState<string | null>(null);

  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [quickDesc, setQuickDesc] = useState("");
  const [quickType, setQuickType] = useState<IssueType>("BUG");
  const [quickPriority, setQuickPriority] = useState<Priority>("MEDIUM");
  const [quickSeverity, setQuickSeverity] = useState<Severity>("MINOR");
  const [quickCreating, setQuickCreating] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const fetchData = async (silent = false) => {
    const fetchId = ++latestFetchRef.current;
    if (!silent) setIsLoading(true);
    if (silent) setIsRefreshing(true);
    setError(null);
    try {
      const [sprintsData, overviewData] = await Promise.all([
        SprintService.getSprintsByProject(projectId),
        SprintService.getProjectSprintSummary(projectId),
      ]);
      setSprints(sprintsData);
      setOverview(overviewData);

      const issuesMap: Record<number, Issue[]> = {};
      const analyticsMap: Record<number, SprintAnalytics> = {};
      await Promise.all(
        sprintsData.map(async (sprint) => {
          const [issuesResponse, analyticsResponse] = await Promise.all([
            issuesApi.list({ sprint_id: sprint.id, page_size: 100 }),
            SprintService.getSprintAnalytics(sprint.id),
          ]);
          issuesMap[sprint.id] = issuesResponse.items;
          analyticsMap[sprint.id] = analyticsResponse;
        })
      );
      if (fetchId !== latestFetchRef.current) return;
      setSprintIssues(issuesMap);
      setAnalytics(analyticsMap);
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!projectId) return;

    let isMounted = true;
    let timerId: number;

    const pollData = async () => {
      await fetchData(true);
      if (isMounted) {
        timerId = window.setTimeout(pollData, 3000);
      }
    };

    fetchData();
    timerId = window.setTimeout(pollData, 3000);

    const handleSprintDataUpdated = () => fetchData(true);
    const handleWindowFocus = () => fetchData(true);

    window.addEventListener("issue:status-updated", handleSprintDataUpdated);
    window.addEventListener("issue:sprint-updated", handleSprintDataUpdated);
    window.addEventListener("issue:assigned", handleSprintDataUpdated);
    window.addEventListener("focus", handleWindowFocus);

    return () => {
      isMounted = false;
      window.clearTimeout(timerId);
      window.removeEventListener("issue:status-updated", handleSprintDataUpdated);
      window.removeEventListener("issue:sprint-updated", handleSprintDataUpdated);
      window.removeEventListener("issue:assigned", handleSprintDataUpdated);
      window.removeEventListener("focus", handleWindowFocus);
    };
  }, [projectId]);

  const filteredSprints = useMemo(() => {
    return sprints
      .filter((s) => {
        if (statusFilter !== "ALL" && s.status !== statusFilter) return false;
        if (
          searchQuery &&
          !s.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
          !s.goal?.toLowerCase().includes(searchQuery.toLowerCase())
        ) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.id - a.id);
  }, [sprints, statusFilter, searchQuery]);

  const openEditSprint = (sprint: Sprint) => {
    setEditSprintId(sprint.id);
    setFormName(sprint.name);
    setFormGoal(sprint.goal || "");
    setFormStart(sprint.start_date.split("T")[0]);
    setFormEnd(sprint.end_date.split("T")[0]);
    setFormCapacityMembers(sprint.estimated_team_members ? String(sprint.estimated_team_members) : "");
    setFormCapacityDays(sprint.working_days ? String(sprint.working_days) : "");
    setFormCapacityHours(sprint.hours_per_day ? String(sprint.hours_per_day) : "");
    setFormError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);
    try {
      await SprintService.createSprint({
        name: formName,
        goal: formGoal || undefined,
        start_date: new Date(formStart).toISOString(),
        end_date: new Date(formEnd).toISOString(),
        project_id: projectId,
        estimated_team_members: formCapacityMembers ? Number(formCapacityMembers) : undefined,
        working_days: formCapacityDays ? Number(formCapacityDays) : undefined,
        hours_per_day: formCapacityHours ? Number(formCapacityHours) : undefined,
      });
      setIsCreateOpen(false);
      setFormName("");
      setFormGoal("");
      setFormStart("");
      setFormEnd("");
      setFormCapacityMembers("");
      setFormCapacityDays("");
      setFormCapacityHours("");
      fetchData();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSprintId) return;
    setFormError(null);
    setIsSubmitting(true);
    try {
      await SprintService.updateSprint(editSprintId, {
        name: formName,
        goal: formGoal || undefined,
        start_date: new Date(formStart).toISOString(),
        end_date: new Date(formEnd).toISOString(),
        estimated_team_members: formCapacityMembers ? Number(formCapacityMembers) : undefined,
        working_days: formCapacityDays ? Number(formCapacityDays) : undefined,
        hours_per_day: formCapacityHours ? Number(formCapacityHours) : undefined,
      });
      setEditSprintId(null);
      fetchData();
    } catch (err) {
      setFormError(getApiErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartSprint = async (sprintId: number) => {
    try {
      await SprintService.startSprint(sprintId);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completeSprintId) return;
    try {
      await SprintService.completeSprint(completeSprintId);
      setIsCompleteOpen(false);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleRemoveIssue = async (sprintId: number, issueId: number) => {
    if (!window.confirm("Remove this issue from the sprint?")) return;
    try {
      await SprintService.removeIssueFromSprint(sprintId, issueId);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleArchiveSprint = async (sprintId: number) => {
    if (!window.confirm("Archive this sprint?")) return;
    try {
      await SprintService.archiveSprint(sprintId);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleDeleteSprint = async (sprintId: number) => {
    if (!window.confirm("Permanently delete this sprint?")) return;
    try {
      await SprintService.deleteSprint(sprintId);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const handleExtendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extendSprintId || !formExtendEnd) return;
    try {
      await SprintService.extendSprint(extendSprintId, {
        new_end_date: new Date(formExtendEnd).toISOString(),
      });
      setIsExtendOpen(false);
      fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    }
  };

  const openAssignTesterModal = async (sprintId: number) => {
    setAssignTesterSprintId(sprintId);
    setSelectedTesterId("");
    setIsAssignTesterOpen(true);
    try {
      const res = await usersApi.list({ role: "TESTER", is_active: true, page_size: 100 });
      setTesterList(res.items);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignTester = async () => {
    if (!assignTesterSprintId || !selectedTesterId) return;
    setAssigningTester(true);
    try {
      await SprintService.assignTester(assignTesterSprintId, Number(selectedTesterId));
      setIsAssignTesterOpen(false);
      await fetchData();
    } catch (err) {
      alert(getApiErrorMessage(err));
    } finally {
      setAssigningTester(false);
    }
  };

  const openAddIssuesModal = async (sprintId: number) => {
    setAddIssuesSprintId(sprintId);
    setSelectedIssueIds(new Set());
    setAvailableIssues([]);
    setAddIssuesError(null);
    setIsAddIssuesOpen(true);
    setLoadingAvailableIssues(true);
    try {
      const response = await issuesApi.list({
        project_id: projectId,
        backlog: true,
        page_size: 100,
      });
      setAvailableIssues(response.items);
    } catch (err) {
      setAddIssuesError(getApiErrorMessage(err));
    } finally {
      setLoadingAvailableIssues(false);
    }
  };

  const handleAddIssues = async () => {
    if (!addIssuesSprintId || selectedIssueIds.size === 0) return;
    setAddingIssues(true);
    setAddIssuesError(null);
    try {
      await issuesApi.bulkAssignSprint({
        issue_ids: Array.from(selectedIssueIds),
        sprint_id: addIssuesSprintId,
      });
      setIsAddIssuesOpen(false);
      await fetchData(true);
    } catch (err) {
      setAddIssuesError(getApiErrorMessage(err));
    } finally {
      setAddingIssues(false);
    }
  };

  const handleQuickCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addIssuesSprintId) return;
    if (quickTitle.trim().length < 5) {
      setQuickError("Title must be at least 5 characters.");
      return;
    }
    setQuickError(null);
    setQuickCreating(true);
    try {
      await issuesApi.create({
        project_id: projectId,
        sprint_id: addIssuesSprintId,
        title: quickTitle.trim(),
        description: quickDesc.trim() || "Created from Sprint Backlog",
        issue_type: quickType,
        priority: quickPriority,
        severity: quickSeverity,
      });
      setIsQuickCreateOpen(false);
      setQuickTitle("");
      setQuickDesc("");
      await fetchData(true);
    } catch (err) {
      setQuickError(getApiErrorMessage(err));
    } finally {
      setQuickCreating(false);
    }
  };

  if (isLoading) return <LoadingSpinner message="Loading sprints & analytics..." />;
  if (error) return <ErrorMessage message={error} onRetry={fetchData} />;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", fontWeight: 600 }}>PROJECT SPRINTS</span>
            <span style={{ color: "var(--border-muted)" }}>•</span>
            <span className="badge" style={{ background: "var(--primary-subtle)", color: "#818cf8" }}>Agile Center</span>
          </div>
          <h1 className="page-title">Sprints Dashboard</h1>
          <p className="page-subtitle">Track velocity, analyze burndown trajectory, and manage team workloads.</p>
        </div>
        {isAdmin && (
          <button className="btn btn-primary" onClick={() => setIsCreateOpen(true)} style={{ boxShadow: "0 4px 14px rgba(99, 102, 241, 0.3)" }}>
            <Plus size={16} /> Create Sprint
          </button>
        )}
      </div>

      {/* KPI Overview Summary Bar */}
      {overview && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.75rem" }}>
          {[
            { label: "Total Sprints", value: overview.total_sprints, suffix: "", color: "#6366f1", icon: <Target size={16} /> },
            { label: "Completed", value: overview.completed_sprints, suffix: "", color: "#10b981", icon: <CheckCheck size={16} /> },
            { label: "Avg Velocity", value: overview.avg_velocity, suffix: " pts", color: "#f59e0b", icon: <Zap size={16} /> },
            { label: "Avg Completion", value: overview.avg_completion_rate, suffix: "%", color: "#06b6d4", icon: <Activity size={16} /> },
            { label: "Overdue Sprints", value: overview.overdue_sprints, suffix: "", color: overview.overdue_sprints > 0 ? "#ef4444" : "#94a3b8", icon: <Clock size={16} /> },
          ].map((kpi, i) => (
            <div key={i} className="sprint-hero-kpi" style={{ borderTop: `3px solid ${kpi.color}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>{kpi.label}</span>
                <span style={{ color: kpi.color, opacity: 0.8 }}>{kpi.icon}</span>
              </div>
              <div style={{ fontSize: "1.85rem", fontWeight: 800, color: kpi.color, lineHeight: 1 }}>{kpi.value}{kpi.suffix}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div className="sprint-filter-tabs" style={{ margin: 0 }}>
          {["ALL", "ACTIVE", "IN_PROGRESS", "PLANNED", "COMPLETED"].map((st) => (
            <button
              key={st}
              className={`sprint-filter-tab ${statusFilter === st ? "active" : ""}`}
              onClick={() => setStatusFilter(st)}
            >
              {st === "ALL" && <Filter size={13} />}
              {st === "ACTIVE" && <span className="sprint-pulse-dot pulse-active" />}
              {st === "IN_PROGRESS" && <span className="sprint-pulse-dot pulse-in-progress" />}
              {st === "PLANNED" && <span className="sprint-pulse-dot pulse-planned" />}
              {st === "COMPLETED" && <span className="sprint-pulse-dot pulse-completed" />}
              {st === "ALL" ? "All Sprints" : st === "IN_PROGRESS" ? "In Progress" : st.charAt(0) + st.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        <div style={{ position: "relative", minWidth: "240px" }}>
          <Search size={14} style={{ position: "absolute", left: "0.85rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search sprints..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: "2.3rem", paddingRight: "0.8rem", height: "36px", fontSize: "0.85rem", borderRadius: "var(--radius-full)" }}
          />
        </div>
      </div>

      {/* Sprint Comparison Multi-Chart */}
      {sprints.length > 1 && Object.keys(analytics).length > 0 && (
        <div className="card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.75rem", border: "1px solid var(--border-subtle)", background: "var(--bg-surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <TrendingUp size={16} style={{ color: "#6366f1" }} /> Velocity & Completion Comparison
            </h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Across all active & completed cycles</span>
          </div>
          <SprintComparisonChart sprints={sprints} analytics={analytics} />
        </div>
      )}

      {/* Sprints List */}
      {filteredSprints.length === 0 ? (
        <EmptyState
          title="No sprints found"
          description={searchQuery || statusFilter !== "ALL" ? "No sprints matched your current search or status filter." : "Create your first sprint to start planning and executing work."}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {filteredSprints.map((sprint) => {
            const sa = analytics[sprint.id];
            const healthCfg = sa?.sprint_health ? HEALTH_CONFIG[sa.sprint_health] : null;

            return (
              <div
                key={sprint.id}
                className="card"
                style={{
                  padding: "1.75rem",
                  border: "1px solid var(--border-subtle)",
                  boxShadow: "var(--shadow-sm)",
                  background: "var(--bg-surface)",
                }}
              >
                {/* Sprint Card Header */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "1.5rem",
                    borderBottom: "1px solid var(--border-subtle)",
                    paddingBottom: "1.25rem",
                    flexWrap: "wrap",
                    gap: "1rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                      <h3 style={{ margin: 0, fontSize: "1.35rem", fontWeight: 700 }}>{sprint.name}</h3>

                      {/* Status Badge */}
                      <span
                        style={{
                          fontSize: "0.76rem",
                          padding: "0.25rem 0.75rem",
                          borderRadius: "var(--radius-full)",
                          fontWeight: 700,
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          backgroundColor:
                            sprint.status === "ACTIVE"
                              ? "rgba(99,102,241,0.18)"
                              : sprint.status === "IN_PROGRESS"
                              ? "rgba(245,158,11,0.18)"
                              : sprint.status === "READY_FOR_APPROVAL"
                              ? "rgba(6,182,212,0.18)"
                              : sprint.status === "COMPLETED"
                              ? "rgba(16,185,129,0.18)"
                              : "rgba(148,163,184,0.12)",
                          color:
                            sprint.status === "ACTIVE"
                              ? "#818cf8"
                              : sprint.status === "IN_PROGRESS"
                              ? "#fbbf24"
                              : sprint.status === "READY_FOR_APPROVAL"
                              ? "#22d3ee"
                              : sprint.status === "COMPLETED"
                              ? "#34d399"
                              : "#94a3b8",
                          border: `1px solid ${
                            sprint.status === "ACTIVE"
                              ? "#4f46e5"
                              : sprint.status === "IN_PROGRESS"
                              ? "#d97706"
                              : sprint.status === "READY_FOR_APPROVAL"
                              ? "#0891b2"
                              : sprint.status === "COMPLETED"
                              ? "#059669"
                              : "var(--border-subtle)"
                          }`,
                        }}
                      >
                        {sprint.status === "ACTIVE" && <span className="sprint-pulse-dot pulse-active" />}
                        {sprint.status === "IN_PROGRESS" && <span className="sprint-pulse-dot pulse-in-progress" />}
                        {sprint.status === "COMPLETED" && <span className="sprint-pulse-dot pulse-completed" />}
                        {sprint.status === "PLANNED" && <span className="sprint-pulse-dot pulse-planned" />}
                        {sprint.status === "IN_PROGRESS"
                          ? "In Progress"
                          : sprint.status === "READY_FOR_APPROVAL"
                          ? "Awaiting Approval"
                          : sprint.status}
                      </span>

                      {/* Tester Badge */}
                      {sprint.assigned_tester_name && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.35rem",
                            background: "rgba(31, 41, 55, 0.4)",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "var(--radius-full)",
                            border: "1px solid var(--border-subtle)",
                          }}
                        >
                          <UserCheck size={13} style={{ color: "#34d399" }} /> {sprint.assigned_tester_name}
                        </span>
                      )}

                      {healthCfg && (
                        <span
                          style={{
                            fontSize: "0.72rem",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "var(--radius-full)",
                            fontWeight: 700,
                            backgroundColor: healthCfg.bg,
                            color: healthCfg.color,
                            border: `1px solid ${healthCfg.color}44`,
                          }}
                        >
                          {healthCfg.label}
                        </span>
                      )}
                    </div>

                    <p style={{ margin: "0.5rem 0 0.35rem", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      {sprint.goal || <span style={{ fontStyle: "italic", color: "var(--text-muted)" }}>No sprint goal specified</span>}
                    </p>

                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <Calendar size={13} /> {formatDate(sprint.start_date)} — {formatDate(sprint.end_date)}
                    </p>
                  </div>

                  {/* Actions Toolbar */}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => SprintService.downloadSprintReport(sprint.id, sprint.name)}>
                      <Download size={14} /> PDF Report
                    </button>

                    {isAdmin && sprint.status !== "COMPLETED" && sprint.status !== "ARCHIVED" && (
                      <>
                        <Link className="btn btn-secondary btn-sm" to={`/create-issue?project_id=${projectId}`}>
                          <Plus size={14} /> Create Issue
                        </Link>
                        <button className="btn btn-primary btn-sm" onClick={() => openAddIssuesModal(sprint.id)}>
                          <Plus size={14} /> Add Issues
                        </button>
                      </>
                    )}

                    {isAdmin && sprint.status === "PLANNED" && (
                      <button className="btn btn-primary btn-sm" onClick={() => handleStartSprint(sprint.id)}>
                        <Play size={14} /> Start Sprint
                      </button>
                    )}

                    {isAdmin && (sprint.status === "ACTIVE" || sprint.status === "PLANNED") && (
                      <button className="btn btn-secondary btn-sm" onClick={() => { setExtendSprintId(sprint.id); setIsExtendOpen(true); }}>
                        <Calendar size={14} /> Extend
                      </button>
                    )}

                    {isAdmin && (sprint.status === "ACTIVE" || sprint.status === "IN_PROGRESS" || sprint.status === "READY_FOR_APPROVAL") && (
                      <button className="btn btn-success btn-sm" onClick={() => { setCompleteSprintId(sprint.id); setIsCompleteOpen(true); }}>
                        <CheckCircle size={14} /> Complete
                      </button>
                    )}

                    {isAdmin && sprint.status === "COMPLETED" && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleArchiveSprint(sprint.id)}>
                        <Archive size={14} /> Archive
                      </button>
                    )}

                    {isAdmin && sprint.status !== "ARCHIVED" && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openEditSprint(sprint)}>
                        <Pencil size={14} /> Edit
                      </button>
                    )}

                    {isAdmin && (
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteSprint(sprint.id)}>
                        <Trash2 size={14} /> Delete
                      </button>
                    )}

                    {isAdmin && (sprint.status === "PLANNED" || sprint.status === "ACTIVE" || sprint.status === "IN_PROGRESS") && (
                      <button className="btn btn-secondary btn-sm" onClick={() => openAssignTesterModal(sprint.id)}>
                        <UserCheck size={14} /> {sprint.assigned_tester_name ? "Reassign Tester" : "Assign Tester"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Overdue alert */}
                {sa?.is_overdue && (
                  <div className="alert-box alert-danger" style={{ marginBottom: "1.25rem", display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
                    <AlertTriangle size={16} /> This sprint is overdue by {sa.days_overdue} day{sa.days_overdue !== 1 ? "s" : ""}!
                  </div>
                )}

                {/* Admin Feedback */}
                {sprint.review_comment && sprint.status === "IN_PROGRESS" && (
                  <div style={{ marginBottom: "1.25rem", padding: "0.85rem 1rem", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.4)", borderRadius: "8px", borderLeft: "4px solid #f59e0b", display: "flex", alignItems: "flex-start", gap: "0.75rem", fontSize: "0.875rem" }}>
                    <RotateCcw size={16} style={{ color: "#f59e0b", flexShrink: 0, marginTop: "0.1rem" }} />
                    <div>
                      <strong style={{ color: "#fbbf24" }}>Changes Requested by Admin:</strong>
                      <p style={{ margin: "0.25rem 0 0", color: "var(--text-secondary)" }}>{sprint.review_comment}</p>
                    </div>
                  </div>
                )}

                {/* Sprint Analytics Grid */}
                {sa && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
                      {[
                        { label: "Progress", value: `${sa.completion_rate}%`, color: "#6366f1", bar: sa.completion_rate },
                        { label: "Total Scope", value: `${sa.total_issues} issues`, color: "#94a3b8", bar: null },
                        { label: "Completed", value: `${sa.completed_issues} issues`, color: "#10b981", bar: null },
                        { label: "Remaining", value: `${sa.remaining_issues} issues`, color: "#f59e0b", bar: null },
                        { label: "Capacity", value: sa.total_capacity_hours ? `${sa.total_capacity_hours} hrs` : "Not set", color: "#06b6d4", bar: null },
                        { label: "Est. Effort", value: `${sa.total_estimated_effort} pts`, color: "#a78bfa", bar: null },
                      ].map((stat, i) => (
                        <div key={i} className="sprint-stat-card">
                          <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: "0.3rem", textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{stat.label}</div>
                          <div style={{ fontSize: "1.2rem", fontWeight: 800, color: stat.color }}>{stat.value}</div>
                          {stat.bar !== null && (
                            <div style={{ marginTop: "0.45rem", height: "5px", background: "var(--bg-app)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${stat.bar}%`, height: "100%", background: `linear-gradient(90deg, #6366f1, #10b981)`, borderRadius: "3px", transition: "width 0.5s ease" }} />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Chart Panels */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                      <div className="card" style={{ padding: "1.2rem", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                          <h4 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <TrendingUp size={15} style={{ color: "#6366f1" }} /> Burndown Trajectory
                          </h4>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sa.burndown_points?.length > 0 ? `${sa.burndown_points.length} days logged` : "Ideal guideline"}</span>
                        </div>
                        <BurndownChartPanel analytics={sa} sprint={sprint} />
                      </div>

                      <div className="card" style={{ padding: "1.2rem", border: "1px solid var(--border-subtle)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                          <h4 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <Target size={15} style={{ color: "#f59e0b" }} /> Issue Breakdown
                          </h4>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sa.total_issues} total scope</span>
                        </div>
                        <IssueCompositionChart analytics={sa} />
                      </div>
                    </div>

                    <div className="card" style={{ padding: "1.2rem", border: "1px solid var(--border-subtle)", marginBottom: "1.5rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                        <h4 style={{ margin: 0, fontSize: "0.95rem", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                          <Users size={15} style={{ color: "#10b981" }} /> Team Workload Distribution
                        </h4>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{sa.workload.length} assigned member{sa.workload.length !== 1 ? "s" : ""}</span>
                      </div>
                      <TeamWorkloadChart workload={sa.workload} />
                    </div>
                  </>
                )}

                {/* Sprint Issues List */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.85rem" }}>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Assigned Sprint Issues</h4>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{sprintIssues[sprint.id]?.length || 0} items</span>
                </div>

                {sprintIssues[sprint.id]?.length === 0 ? (
                  <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", fontStyle: "italic", margin: "0.5rem 0 0" }}>No issues currently assigned to this sprint.</p>
                ) : (
                  <div className="table-container" style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: "120px" }}>Key</th>
                          <th>Title</th>
                          <th style={{ width: "140px" }}>Status</th>
                          {isAdmin && sprint.status !== "COMPLETED" && <th style={{ width: "90px", textAlign: "center" }}>Action</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {sprintIssues[sprint.id]?.map((issue) => {
                          const isDone = issue.status === "RESOLVED" || issue.status === "CLOSED";
                          const isInProg = issue.status === "IN_DEVELOPMENT" || issue.status === "IN_REVIEW" || issue.status === "IN_TESTING";

                          return (
                            <tr key={issue.id}>
                              <td>
                                <Link
                                  to={`/issues/${issue.id}`}
                                  className="text-primary font-mono"
                                  style={{
                                    fontWeight: 700,
                                    fontSize: "0.82rem",
                                    padding: "0.2rem 0.5rem",
                                    background: "rgba(99,102,241,0.1)",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(99,102,241,0.25)",
                                    display: "inline-block",
                                  }}
                                >
                                  {issue.issue_key}
                                </Link>
                              </td>
                              <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{issue.title}</td>
                              <td>
                                <span
                                  className={`issue-status-pill ${
                                    isDone ? "resolved" : isInProg ? "in-progress" : "open"
                                  }`}
                                >
                                  {issue.status.replace("_", " ")}
                                </span>
                              </td>
                              {isAdmin && sprint.status !== "COMPLETED" && (
                                <td style={{ textAlign: "center" }}>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => handleRemoveIssue(sprint.id, issue.id)}
                                    style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem" }}
                                  >
                                    Remove
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Create Sprint">
        {formError && <div className="alert-box alert-danger">{formError}</div>}
        <form onSubmit={handleCreateSubmit}>
          <div className="form-group">
            <label className="form-label">Sprint Name *</label>
            <input type="text" className="form-input" required value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Sprint 1: MVP Core" />
          </div>
          <div className="form-group">
            <label className="form-label">Sprint Goal</label>
            <textarea className="form-textarea" value={formGoal} onChange={(e) => setFormGoal(e.target.value)} placeholder="What is the objective of this sprint cycle?" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" required value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" required value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
            </div>
          </div>
          <h4 style={{ margin: "1.5rem 0 0.5rem", paddingBottom: "0.5rem", borderBottom: "1px solid var(--border-subtle)" }}>Capacity Planning (Optional)</h4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Team Members</label>
              <input type="number" className="form-input" min="1" value={formCapacityMembers} onChange={(e) => setFormCapacityMembers(e.target.value)} placeholder="e.g. 5" />
            </div>
            <div className="form-group">
              <label className="form-label">Working Days</label>
              <input type="number" className="form-input" min="1" value={formCapacityDays} onChange={(e) => setFormCapacityDays(e.target.value)} placeholder="e.g. 10" />
            </div>
            <div className="form-group">
              <label className="form-label">Hours / Day</label>
              <input type="number" className="form-input" min="1" value={formCapacityHours} onChange={(e) => setFormCapacityHours(e.target.value)} placeholder="e.g. 8" />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsCreateOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>Create Sprint</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={editSprintId !== null} onClose={() => setEditSprintId(null)} title="Edit Sprint">
        {formError && <div className="alert-box alert-danger">{formError}</div>}
        <form onSubmit={handleEditSubmit}>
          <div className="form-group">
            <label className="form-label">Sprint Name *</label>
            <input type="text" className="form-input" required value={formName} onChange={(e) => setFormName(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Sprint Goal</label>
            <textarea className="form-textarea" value={formGoal} onChange={(e) => setFormGoal(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input type="date" className="form-input" required value={formStart} onChange={(e) => setFormStart(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input type="date" className="form-input" required value={formEnd} onChange={(e) => setFormEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="form-label">Team Members</label>
              <input type="number" className="form-input" min="1" value={formCapacityMembers} onChange={(e) => setFormCapacityMembers(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Working Days</label>
              <input type="number" className="form-input" min="1" value={formCapacityDays} onChange={(e) => setFormCapacityDays(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Hours / Day</label>
              <input type="number" className="form-input" min="1" value={formCapacityHours} onChange={(e) => setFormCapacityHours(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setEditSprintId(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Changes"}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isCompleteOpen} onClose={() => setIsCompleteOpen(false)} title="Complete Sprint">
        <form onSubmit={handleCompleteSubmit}>
          <p style={{ marginBottom: "0.75rem", color: "var(--text-primary)" }}>Are you sure you want to complete this sprint?</p>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", lineHeight: 1.5, background: "rgba(99,102,241,0.1)", padding: "0.75rem", borderRadius: "6px", border: "1px solid rgba(99,102,241,0.25)" }}>
            ✨ <strong>Company-Grade Auto-Rollover:</strong> Resolved & Closed issues will stay in this sprint for historical analytics. Any unfinished work will automatically roll over to the Backlog.
          </p>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsCompleteOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-success">Complete Sprint</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isExtendOpen} onClose={() => setIsExtendOpen(false)} title="Extend Sprint">
        <form onSubmit={handleExtendSubmit}>
          <div className="form-group">
            <label className="form-label">New End Date *</label>
            <input type="date" className="form-input" required value={formExtendEnd} onChange={(e) => setFormExtendEnd(e.target.value)} />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setIsExtendOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Extend Sprint</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isAssignTesterOpen} onClose={() => setIsAssignTesterOpen(false)} title="Assign Tester to Sprint">
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", margin: 0 }}>
            Select a dedicated QA/Tester to lead verification for this sprint cycle.
          </p>
          <div className="form-group">
            <label className="form-label">Tester</label>
            <select
              className="form-select"
              value={selectedTesterId}
              onChange={(e) => setSelectedTesterId(Number(e.target.value) || "")}
            >
              <option value="">— Select a tester —</option>
              {testerList.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name} ({t.email})
                </option>
              ))}
            </select>
            {testerList.length === 0 && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.5rem" }}>No active testers found.</p>
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
            <button className="btn btn-secondary" onClick={() => setIsAssignTesterOpen(false)}>Cancel</button>
            <button
              className="btn btn-primary"
              disabled={!selectedTesterId || assigningTester}
              onClick={handleAssignTester}
            >
              {assigningTester ? "Assigning..." : "Assign Tester"}
            </button>
          </div>
        </div>
      </Modal>

      <Modal 
        isOpen={isAddIssuesOpen} 
        onClose={() => setIsAddIssuesOpen(false)} 
        title={
          <>
            Add Backlog Issues to <span style={{ color: 'var(--primary)', fontWeight: 800 }}>{sprints.find(s => s.id === addIssuesSprintId)?.name || "Sprint"}</span>
          </>
        }
      >
        {addIssuesError && <div className="alert-box alert-danger">{addIssuesError}</div>}
        {loadingAvailableIssues ? (
          <LoadingSpinner message="Loading unassigned backlog issues..." />
        ) : availableIssues.length === 0 ? (
          <EmptyState 
            title="No unassigned issues" 
            description="All issues are currently in sprints. Create an issue in the Backlog first." 
            action={
              <Link 
                to="/issues?create=true" 
                className="btn btn-primary" 
                onClick={() => setIsAddIssuesOpen(false)}
                style={{ marginTop: '0.5rem', display: 'inline-flex', padding: '0.5rem 1rem' }}
              >
                Create New Backlog
              </Link>
            }
          />
        ) : (
          <div>
            <p style={{ marginTop: 0, color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              Select backlog items to include in this sprint scope:
            </p>
            <div style={{ maxHeight: "320px", overflowY: "auto", border: "1px solid var(--border-subtle)", borderRadius: "6px" }}>
              {availableIssues.map((issue) => (
                <label
                  key={issue.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.65rem",
                    padding: "0.75rem 0.85rem",
                    borderBottom: "1px solid var(--border-subtle)",
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedIssueIds.has(issue.id)}
                    onChange={() =>
                      setSelectedIssueIds((current) => {
                        const next = new Set(current);
                        if (next.has(issue.id)) next.delete(issue.id);
                        else next.add(issue.id);
                        return next;
                      })
                    }
                  />
                  <span
                    style={{
                      minWidth: "75px",
                      fontFamily: "monospace",
                      color: "var(--primary)",
                      fontWeight: 700,
                      fontSize: "0.82rem",
                    }}
                  >
                    {issue.issue_key}
                  </span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.9rem", color: "var(--text-primary)" }}>
                    {issue.title}
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setIsAddIssuesOpen(false)} disabled={addingIssues}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAddIssues} disabled={addingIssues || selectedIssueIds.size === 0}>
                {addingIssues ? "Adding..." : `Add ${selectedIssueIds.size} Issue${selectedIssueIds.size === 1 ? "" : "s"}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
