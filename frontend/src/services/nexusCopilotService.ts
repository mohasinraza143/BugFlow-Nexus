import { issuesApi } from '../api/issues';
import { projectsApi } from '../api/projects';
import { analyticsApi } from '../api/analytics';
import { adminApi } from '../api/admin';
import type { Issue, IssueCreate } from '../types/issue';
import type { Project } from '../types/project';
import type { User, UserRole } from '../types/auth';

export interface CopilotMessage {
  id: string;
  sender: 'user' | 'copilot';
  timestamp: string;
  text: string;
  issues?: Issue[];
  projects?: Project[];
  showCreateBugForm?: boolean;
  prefilledTitle?: string;
  metrics?: {
    totalIssues?: number;
    openIssues?: number;
    resolvedIssues?: number;
    criticalIssues?: number;
    unassignedIssues?: number;
  };
  adminStats?: {
    totalUsers: number;
    activeUsers: number;
    totalProjects: number;
    reportedIssues: number;
    inDevIssues: number;
    resolvedIssues: number;
    unresolvedIssues: number;
    blockerCount: number;
  };
  suggestedActions?: string[];
  roleBadge?: string;
}

export const nexusCopilotService = {
  /**
   * Generates a tailored, role-aware welcome message when a conversation begins.
   */
  getWelcomeMessage(currentUser: User | null): CopilotMessage {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const name = currentUser?.full_name ? currentUser.full_name.split(' ')[0] : 'Engineer';
    const role: UserRole = currentUser?.role || 'USER';

    if (role === 'ADMIN') {
      return {
        id: 'msg-welcome-admin',
        sender: 'copilot',
        timestamp: now,
        roleBadge: '👑 ADMIN COGNITION',
        text: `Greetings Admin **${name}**! 👑\n\nYou have full administrative oversight of BugFlow-Nexus. I am your **Enterprise Operations Copilot**. Here is what I can monitor for you:\n* 🔍 **Triage & Backlog**: Track unassigned defect tickets waiting for assignment.\n* 📊 **Admin Dashboard**: System health, active users, and cross-project throughput.\n* 🚨 **High-Risk Alerts**: Real-time scan of Blocker & Critical defects across all teams.\n* 👥 **Workload Matrix**: Developer capacity and defect bottlenecks.`,
        suggestedActions: [
          'Show unassigned issues (Need Triage)',
          'Admin dashboard overview',
          'List blocker & critical bugs',
          'Show all active projects',
          'Explain defect lifecycle',
        ],
      };
    }

    if (role === 'TESTER') {
      return {
        id: 'msg-welcome-tester',
        sender: 'copilot',
        timestamp: now,
        roleBadge: '🧪 QA TESTER INTELLIGENCE',
        text: `Welcome QA Tester **${name}**! 🧪\n\nI am your **Quality Assurance Copilot**. I am directly synced with your testing queues, defect investigations, and test executions:\n* 🎯 **My Assigned Defects**: Bugs assigned to you for investigation and reproduction.\n* 🧪 **QA Verification Queue**: Defects marked resolved by developers and waiting for QA verification.\n* 🚨 **Sprint Blockers**: High-severity bugs impacting testing cycles.\n* ➕ **Quick Defect Logging**: File defect reports directly from this window.`,
        suggestedActions: [
          'My assigned defects to test',
          'Defects ready for QA verification',
          'List blocker & critical bugs',
          'Show my reported tickets',
          'Log a new defect report',
        ],
      };
    }

    if (role === 'DEVELOPER') {
      return {
        id: 'msg-welcome-dev',
        sender: 'copilot',
        timestamp: now,
        roleBadge: '💻 DEVELOPER ENGINE',
        text: `Welcome Developer **${name}**! 💻\n\nI am your **Engineering Copilot**. I track your assigned defects, code reviews, and sprint backlog:\n* 🎯 **Assigned to Me**: Defects waiting for your code fix.\n* 🔨 **In Development**: Issues you are currently fixing.\n* 🚨 **Sprint Blockers**: Critical bugs requiring immediate hotfix.\n* 📊 **Sprint Status**: Sprint defect burn-down and progress.`,
        suggestedActions: [
          'Show my assigned developer issues',
          'List blocker & critical bugs',
          'Current sprint status',
          'Show active projects',
        ],
      };
    }

    // Default: Regular USER / Client
    return {
      id: 'msg-welcome-user',
      sender: 'copilot',
      timestamp: now,
      roleBadge: '👤 CLIENT / USER TRACKER',
      text: `Welcome **${name}**! 👋\n\nI am your personal **Defect & Ticket Tracker**. Here is how I can help you:\n* 📌 **My Reported Tickets**: Check the live status of all bugs and feature requests you submitted.\n* ⏳ **Open / In-Progress Tickets**: See which of your tickets are currently being worked on by engineers.\n* ➕ **Report a New Bug / Feature**: Submit an issue in seconds without leaving this page.\n* 💡 **Status Guide**: Understand what each workflow status means.`,
      suggestedActions: [
        'Show my reported tickets',
        'Check my open tickets',
        'Report a new bug or ticket',
        'View active projects',
        'Explain defect lifecycle',
      ],
    };
  },

  /**
   * Main intelligent query processor. Dynamically routes queries based on User Role.
   */
  async processQuery(query: string, currentUser: User | null): Promise<CopilotMessage> {
    const raw = query.trim();
    const lower = raw.toLowerCase();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const role: UserRole = currentUser?.role || 'USER';

    // ─────────────────────────────────────────────────────────────
    // 1. GREETING
    // ─────────────────────────────────────────────────────────────
    if (/^(hi|hello|hey|namaste|salam|assalam|yo|good morning|good evening)\b/i.test(lower)) {
      return this.getWelcomeMessage(currentUser);
    }

    // ─────────────────────────────────────────────────────────────
    // 2. CREATE / REPORT BUG (Role-Tailored Form)
    // ─────────────────────────────────────────────────────────────
    if (/(create|report|add|naya|banaye|log)\s*(a\s*)?(bug|defect|issue|ticket)/i.test(lower)) {
      let prefilledTitle = '';
      const match = raw.match(/(?:bug|defect|issue|ticket)[:\s]+(.+)/i);
      if (match && match[1]) {
        const potentialTitle = match[1].trim();
        if (potentialTitle.length > 3 && !/^(for me|please|now|fast)$/i.test(potentialTitle)) {
          prefilledTitle = potentialTitle;
        }
      }

      let introText = `Fill out the quick submission card below to log a new defect into BugFlow-Nexus:`;
      if (role === 'USER') {
        introText = `Fill out the ticket card below to report your bug or feature request to the engineering team:`;
      } else if (role === 'TESTER') {
        introText = `Log a verified QA defect report with severity and project assignment:`;
      } else if (role === 'ADMIN') {
        introText = `Create an enterprise defect ticket with full priority controls:`;
      }

      if (prefilledTitle) {
        introText = `I've prepared a defect report draft for: **"${prefilledTitle}"**.\n\nPlease verify details and click **"Submit Defect"**:`;
      }

      return {
        id: `msg-${Date.now()}`,
        sender: 'copilot',
        timestamp: now,
        text: introText,
        showCreateBugForm: true,
        prefilledTitle,
        suggestedActions: [
          role === 'USER' ? 'Show my reported tickets' : 'Show my assigned bugs',
          'List blocker & critical bugs',
        ],
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 3. UNASSIGNED ISSUES (Crucial for ADMIN / QA LEAD)
    // ─────────────────────────────────────────────────────────────
    if (/(unassigned|triage|need triage|bina assign|without assignee|backlog triage)/i.test(lower)) {
      try {
        const res = await issuesApi.list({ unassigned: true, page_size: 10 });
        const items = res.items || [];

        if (items.length === 0) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `🎯 **All clear!** There are currently **0 unassigned issues** in the backlog. Every single reported ticket has been allocated to a developer or tester.`,
            suggestedActions: ['Admin dashboard overview', 'List blocker & critical bugs'],
          };
        }

        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `📋 Found **${items.length} unassigned defect(s)** awaiting triage and developer allocation:`,
          issues: items,
          suggestedActions: [
            'Admin dashboard overview',
            'List blocker & critical bugs',
            'Show all active projects',
          ],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Could not retrieve unassigned issues: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 4. QA VERIFICATION QUEUE (Crucial for TESTER)
    // ─────────────────────────────────────────────────────────────
    if (/(qa verification|ready for test|testing queue|verification queue|qa queue|test karne wale)/i.test(lower)) {
      try {
        const [qaRes, inTestingRes] = await Promise.all([
          issuesApi.list({ status: 'QA_VERIFICATION', page_size: 10 }).catch(() => ({ items: [] })),
          issuesApi.list({ status: 'IN_TESTING', page_size: 10 }).catch(() => ({ items: [] })),
        ]);

        const combined = [...(qaRes.items || []), ...(inTestingRes.items || [])];
        const uniqueItems = Array.from(new Map(combined.map((i) => [i.id, i])).values());

        if (uniqueItems.length === 0) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `🧪 **QA Verification Queue is empty!** There are currently no defects in \`QA_VERIFICATION\` or \`IN_TESTING\` waiting for testing.`,
            suggestedActions: ['My assigned defects to test', 'Log a new defect report'],
          };
        }

        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `🧪 Found **${uniqueItems.length} defect(s)** ready for QA testing and verification:`,
          issues: uniqueItems,
          suggestedActions: [
            'My assigned defects to test',
            'List blocker & critical bugs',
            'Log a new defect report',
          ],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Failed to fetch QA verification queue: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 5. "MY BUGS" / "MY ISSUES" (Strict Role-Aware Behavior)
    // ─────────────────────────────────────────────────────────────
    if (/(my\s*(bugs|issues|tasks|tickets)|assigned to me|mere bugs|mere tasks|pending on me|my reported)/i.test(lower)) {
      if (!currentUser?.id) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Please sign in to view your personalized tickets and role-based defect queues.`,
          suggestedActions: ['List blocker & critical bugs', 'Show all active projects'],
        };
      }

      // CASE A: USER (Reports issues — does NOT get assigned issues)
      if (role === 'USER' || /(my reported|reported by me|mere report)/i.test(lower)) {
        try {
          const res = await issuesApi.list({ reporter_id: currentUser.id, page_size: 10 });
          const items = res.items || [];

          if (items.length === 0) {
            return {
              id: `msg-${Date.now()}`,
              sender: 'copilot',
              timestamp: now,
              text: `📌 You haven't reported any defect tickets yet!\n\nWould you like to file a new bug or feature request right now? Click the quick button below to start:`,
              suggestedActions: ['Report a new bug or ticket', 'View active projects'],
            };
          }

          const resolved = items.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length;
          const open = items.length - resolved;

          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `📌 Here are your **${items.length} reported ticket(s)** (${open} open / in-progress, ${resolved} resolved):`,
            issues: items,
            metrics: {
              totalIssues: items.length,
              openIssues: open,
              resolvedIssues: resolved,
            },
            suggestedActions: [
              'Check my open tickets',
              'Report a new bug or ticket',
              'View active projects',
            ],
          };
        } catch (err: unknown) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `Failed to fetch your reported tickets: ${(err as Error).message}`,
          };
        }
      }

      // CASE B: TESTER / DEVELOPER (Investigates assigned issues)
      if (role === 'TESTER' || role === 'DEVELOPER') {
        try {
          const res = await issuesApi.list({ assignee_id: currentUser.id, page_size: 10 });
          const items = res.items || [];

          if (items.length === 0) {
            // Also check if they reported any issues
            const repRes = await issuesApi.list({ reporter_id: currentUser.id, page_size: 5 }).catch(() => ({ items: [] }));
            const repItems = repRes.items || [];

            return {
              id: `msg-${Date.now()}`,
              sender: 'copilot',
              timestamp: now,
              text: `🎉 You have **0 defects** currently assigned to your personal queue!\n\n${
                repItems.length > 0
                  ? `However, you have **${repItems.length} defect(s)** that you previously reported.`
                  : role === 'TESTER'
                  ? 'You can check the **QA Verification Queue** to pick up resolved defects ready for testing.'
                  : 'Check the unassigned backlog for tickets to work on.'
              }`,
              issues: repItems.length > 0 ? repItems : undefined,
              suggestedActions: [
                role === 'TESTER' ? 'Defects ready for QA verification' : 'Show unassigned issues (Need Triage)',
                'List blocker & critical bugs',
                'Log a new defect report',
              ],
            };
          }

          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `🎯 You currently have **${items.length} defect(s)** assigned to you for investigation:`,
            issues: items,
            suggestedActions: [
              role === 'TESTER' ? 'Defects ready for QA verification' : 'Current sprint status',
              'List blocker & critical bugs',
              'Log a new defect report',
            ],
          };
        } catch (err: unknown) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `Could not fetch assigned defects: ${(err as Error).message}`,
          };
        }
      }

      // CASE C: ADMIN (System-wide overview + unassigned triage)
      try {
        const [unassignedRes, myAssignedRes] = await Promise.all([
          issuesApi.list({ unassigned: true, page_size: 5 }).catch(() => ({ items: [] })),
          issuesApi.list({ assignee_id: currentUser.id, page_size: 5 }).catch(() => ({ items: [] })),
        ]);

        const unassigned = unassignedRes.items || [];
        const myAssigned = myAssignedRes.items || [];

        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `👑 **Admin Workload Overview**:\n* **${unassigned.length} unassigned tickets** in the backlog awaiting developer triage.\n* **${myAssigned.length} tickets** directly assigned to your admin account.\n\nHere are top priority items:`,
          issues: unassigned.length > 0 ? unassigned : myAssigned,
          suggestedActions: [
            'Show unassigned issues (Need Triage)',
            'Admin dashboard overview',
            'List blocker & critical bugs',
          ],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Admin workload error: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. DASHBOARD OVERVIEW (Role-Specific Dashboard Data)
    // ─────────────────────────────────────────────────────────────
    if (/(dashboard|overview|system stats|mera dashboard|stats|health)/i.test(lower)) {
      // 6.1 ADMIN DASHBOARD
      if (role === 'ADMIN') {
        try {
          const dash = await adminApi.getDashboard();
          const totalUsers = dash.users?.total ?? 0;
          const activeUsers = dash.users?.active ?? 0;
          const totalProjects = dash.projects?.total ?? 0;
          const reported = dash.issues?.reported ?? 0;
          const inDev = dash.issues?.in_development ?? 0;
          const inReview = dash.issues?.in_review ?? 0;
          const resolved = dash.issues?.resolved ?? 0;
          const closed = dash.issues?.closed ?? 0;
          const unresolved = dash.issues?.unresolved ?? 0;
          const totalIssues = dash.issues?.total ?? 0;
          const blockers = dash.severity?.blocker ?? 0;
          const critical = dash.severity?.critical ?? 0;

          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            roleBadge: '👑 ADMIN DASHBOARD METRICS',
            text: `📊 **Enterprise Admin Dashboard Snapshot**:\n\n* 👥 **Users**: ${totalUsers} total (${activeUsers} active, ${dash.users?.testers ?? 0} QA, ${dash.users?.developers ?? 0} devs, ${dash.users?.users ?? 0} clients)\n* 📁 **Projects**: ${totalProjects} active workspaces\n* 📋 **Defect Pipeline**: ${totalIssues} total defects tracked\n  * 🟡 Unresolved: ${unresolved}\n  * 🟢 Resolved / Closed: ${resolved + closed}\n  * ⚙️ In Development / Review: ${inDev + inReview}\n* 🚨 **High-Severity Risks**: ${blockers} Blockers, ${critical} Criticals`,
            adminStats: {
              totalUsers,
              activeUsers,
              totalProjects,
              reportedIssues: reported,
              inDevIssues: inDev + inReview,
              resolvedIssues: resolved + closed,
              unresolvedIssues: unresolved,
              blockerCount: blockers + critical,
            },
            suggestedActions: [
              'Show unassigned issues (Need Triage)',
              'List blocker & critical bugs',
              'Show all active projects',
            ],
          };
        } catch {
          // Fallback to system overview
        }
      }

      // 6.2 TESTER DASHBOARD
      if (role === 'TESTER') {
        try {
          const [assignedRes, qaRes, blockerRes] = await Promise.all([
            issuesApi.list({ assignee_id: currentUser?.id, page_size: 1 }),
            issuesApi.list({ status: 'QA_VERIFICATION', page_size: 1 }),
            issuesApi.list({ severity: 'BLOCKER', page_size: 1 }),
          ]);

          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            roleBadge: '🧪 TESTER DASHBOARD METRICS',
            text: `🧪 **Tester Dashboard Intelligence**:\n\n* 🎯 **My Active Investigations**: ${assignedRes.total} defects assigned to you\n* 📋 **Ready for QA Verification**: ${qaRes.total} defects waiting for test sign-off\n* 🚨 **Current Blocker Defects**: ${blockerRes.total} active blockers in build\n\nClick any button below to jump straight to your work queues:`,
            metrics: {
              openIssues: assignedRes.total,
              resolvedIssues: qaRes.total,
              criticalIssues: blockerRes.total,
            },
            suggestedActions: [
              'My assigned defects to test',
              'Defects ready for QA verification',
              'List blocker & critical bugs',
              'Log a new defect report',
            ],
          };
        } catch (err: unknown) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `Tester dashboard query error: ${(err as Error).message}`,
          };
        }
      }

      // 6.3 USER DASHBOARD
      if (role === 'USER') {
        try {
          const userIssues = await issuesApi.list({ reporter_id: currentUser?.id, page_size: 50 });
          const items = userIssues.items || [];
          const total = items.length;
          const resolved = items.filter((i) => i.status === 'RESOLVED' || i.status === 'CLOSED').length;
          const inDev = items.filter((i) => i.status === 'IN_DEVELOPMENT' || i.status === 'IN_REVIEW').length;
          const awaitingTriage = items.filter((i) => i.status === 'REPORTED' || i.status === 'TRIAGED').length;

          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            roleBadge: '👤 USER DASHBOARD METRICS',
            text: `👤 **Your Personal Ticket Tracker**:\n\n* 📝 **Total Submitted Tickets**: ${total}\n* 🟢 **Resolved by Engineers**: ${resolved}\n* ⚙️ **Currently in Development**: ${inDev}\n* ⏳ **Awaiting Triage & Assignment**: ${awaitingTriage}\n\n*Progress:* ${total > 0 ? Math.round((resolved / total) * 100) : 0}% of your reported tickets are fixed!`,
            metrics: {
              totalIssues: total,
              openIssues: total - resolved,
              resolvedIssues: resolved,
            },
            suggestedActions: [
              'Show my reported tickets',
              'Check my open tickets',
              'Report a new bug or ticket',
            ],
          };
        } catch (err: unknown) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `User dashboard query error: ${(err as Error).message}`,
          };
        }
      }

      // 6.4 GENERAL SYSTEM OVERVIEW
      try {
        const overview = await analyticsApi.getSystemOverview();
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `📊 **System Quality Overview**:\n* Total Tracked Defects: ${overview.total_issues}\n* Active / Open: ${overview.open_issues}\n* Resolved: ${overview.resolved_issues}\n* Blocker / Critical: ${overview.critical_issues}`,
          metrics: {
            totalIssues: overview.total_issues,
            openIssues: overview.open_issues,
            resolvedIssues: overview.resolved_issues,
            criticalIssues: overview.critical_issues,
          },
          suggestedActions: ['List blocker & critical bugs', 'Show all active projects'],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Could not retrieve dashboard metrics: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 7. OPEN / IN-PROGRESS TICKETS FILTER
    // ─────────────────────────────────────────────────────────────
    if (/(open tickets|in progress|pending tickets|active tickets|open bugs)/i.test(lower)) {
      if (role === 'USER') {
        const res = await issuesApi.list({ reporter_id: currentUser?.id, page_size: 15 });
        const openItems = (res.items || []).filter(
          (i) => i.status !== 'RESOLVED' && i.status !== 'CLOSED'
        );
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `⏳ You have **${openItems.length} open/in-progress ticket(s)** currently in the pipeline:`,
          issues: openItems,
          suggestedActions: ['Show my reported tickets', 'Report a new bug or ticket'],
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 8. CRITICAL / BLOCKER / URGENT DEFECTS
    // ─────────────────────────────────────────────────────────────
    if (/(critical|blocker|urgent|p0|high severity|highest priority|khatarnak|severe)/i.test(lower)) {
      try {
        const [blockerRes, criticalRes] = await Promise.all([
          issuesApi.list({ severity: 'BLOCKER', page_size: 5 }).catch(() => ({ items: [] })),
          issuesApi.list({ severity: 'CRITICAL', page_size: 5 }).catch(() => ({ items: [] })),
        ]);

        const combined = [...(blockerRes.items || []), ...(criticalRes.items || [])];
        const uniqueItems = Array.from(new Map(combined.map((item) => [item.id, item])).values()).slice(0, 6);

        if (uniqueItems.length === 0) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `✅ **Zero Blocker or Critical defects found!** Build health and stability are currently optimal.`,
            suggestedActions: [
              role === 'ADMIN' ? 'Admin dashboard overview' : 'Current sprint status',
              role === 'USER' ? 'Show my reported tickets' : 'Show my assigned bugs',
            ],
          };
        }

        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `🚨 Found **${uniqueItems.length} high-severity defect(s)** across the system requiring urgent attention:`,
          issues: uniqueItems,
          suggestedActions: [
            role === 'USER' ? 'Show my reported tickets' : 'Show my assigned bugs',
            role === 'TESTER' ? 'Defects ready for QA verification' : 'Show unassigned issues (Need Triage)',
          ],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Failed to fetch critical issues: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 9. ACTIVE PROJECTS
    // ─────────────────────────────────────────────────────────────
    if (/(project|projects|all projects|active projects|list projects)/i.test(lower)) {
      try {
        const res = await projectsApi.list({ page_size: 15 });
        const projs = res.items || [];
        if (projs.length === 0) {
          return {
            id: `msg-${Date.now()}`,
            sender: 'copilot',
            timestamp: now,
            text: `No active projects found in the system right now.`,
          };
        }

        const projectListMd = projs
          .map((p) => `* **[${p.project_key}]** ${p.name} — *Status: ${p.status}*`)
          .join('\n');

        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `📁 **Active Projects in BugFlow-Nexus**:\n\n${projectListMd}\n\nYou can mention any project key (e.g. \`${projs[0].project_key}\`) to see issues in that workspace.`,
          projects: projs,
          suggestedActions: [
            role === 'USER' ? 'Report a new bug or ticket' : 'List blocker & critical bugs',
          ],
        };
      } catch (err: unknown) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Failed to fetch projects: ${(err as Error).message}`,
        };
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 10. WORKFLOW / STATUS LIFECYCLE
    // ─────────────────────────────────────────────────────────────
    if (/(workflow|lifecycle|status|statuses|transitions|how does it work|kaise kaam karta)/i.test(lower)) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'copilot',
        timestamp: now,
        text: `🔄 **BugFlow Defect Lifecycle & Transition Rules**:\n\n1. **REPORTED** ➔ Bug is logged by a User, Tester, or Admin.\n2. **TRIAGED** ➔ Admin/Lead evaluates severity and priority.\n3. **ASSIGNED** ➔ Assigned to a Developer for investigation.\n4. **IN_DEVELOPMENT** ➔ Developer actively fixing the code.\n5. **IN_REVIEW** ➔ Code review / PR raised.\n6. **IN_TESTING / QA_VERIFICATION** ➔ QA verifies fix against reproduction steps.\n7. **RESOLVED / CLOSED** ➔ Defect confirmed resolved.\n8. **REOPENED** ➔ If QA finds defect still reproduces.`,
        suggestedActions: [
          role === 'USER' ? 'Show my reported tickets' : 'Show my assigned bugs',
          'List blocker & critical bugs',
        ],
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 11. DIRECT SEARCH (Keywords or Issue Key like PROJ-101)
    // ─────────────────────────────────────────────────────────────
    try {
      const searchRes = await issuesApi.list({ search: raw, page_size: 5 });
      const found = searchRes.items || [];

      if (found.length > 0) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'copilot',
          timestamp: now,
          text: `Found **${found.length} issue(s)** matching query: *"${raw}"*:`,
          issues: found,
          suggestedActions: [
            role === 'USER' ? 'Show my reported tickets' : 'Show my assigned bugs',
            'List blocker & critical bugs',
          ],
        };
      }
    } catch {
      // Continue to fallback
    }

    // ─────────────────────────────────────────────────────────────
    // 12. ROLE-AWARE FALLBACK
    // ─────────────────────────────────────────────────────────────
    return {
      id: `msg-${Date.now()}`,
      sender: 'copilot',
      timestamp: now,
      text: `I understood you asked: *"${raw}"*.\n\nBased on your role (**${role}**), here are the most relevant queries you can run right now:`,
      suggestedActions:
        role === 'ADMIN'
          ? [
              'Show unassigned issues (Need Triage)',
              'Admin dashboard overview',
              'List blocker & critical bugs',
              'Show all active projects',
            ]
          : role === 'TESTER'
          ? [
              'My assigned defects to test',
              'Defects ready for QA verification',
              'List blocker & critical bugs',
              'Log a new defect report',
            ]
          : [
              'Show my reported tickets',
              'Check my open tickets',
              'Report a new bug or ticket',
              'View active projects',
            ],
    };
  },

  /**
   * Helper to execute bug creation directly from Copilot.
   */
  async createBugFromCopilot(payload: IssueCreate) {
    return await issuesApi.create(payload);
  },
};
