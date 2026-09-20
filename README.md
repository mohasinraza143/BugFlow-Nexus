# 🐞 BugTracker — Backend

> ### Intelligent Software Defect Tracking & Agile Project Management System

A production-oriented **FastAPI backend** for managing software defects, projects, users, Agile sprints, backlogs, analytics, audit logs, real-time notifications, and reports.

BugTracker provides a centralized platform for managing the complete software issue lifecycle—from issue creation and assignment to sprint planning, resolution tracking, analytics, and reporting.

---

## 🚀 Version

| Property              | Details                                       |
| --------------------- | --------------------------------------------- |
| **Current Version**   | `v1.0.0`                                      |
| **Status**            | 🟢 Active Development                         |
| **Latest Milestone**  | Advanced Sprint Planning & Backlog Management |
| **Backend Framework** | FastAPI                                       |
| **Database**          | PostgreSQL                                    |

---

# 📌 Overview

BugTracker is an intelligent software defect tracking and Agile project management system designed to support modern software development workflows.

The backend provides secure APIs for:

- 🔐 Authentication and authorization
- 👥 Role-Based Access Control (RBAC)
- 🐞 Issue and defect tracking
- 📁 Project management
- 🏃 Agile sprint planning
- 📋 Backlog management
- 📊 Real-time sprint analytics
- 📉 Burndown tracking
- 👨‍💻 Team workload analysis
- 🔔 Real-time notifications
- 📝 Audit logging
- 💬 Issue comments
- 📎 File attachments
- 📈 Advanced analytics
- 📄 CSV and PDF reporting

---

# ✨ Core Features

## 🔐 Authentication & Security

- JWT-based authentication
- Secure password handling
- Email OTP support
- Role-Based Access Control
- Protected API routes
- Role-specific resource access
- Secure dependency-based authorization

### Supported Roles

| Role        | Access Level                                   |
| ----------- | ---------------------------------------------- |
| `ADMIN`     | Full system and sprint management              |
| `DEVELOPER` | Assigned issue access and development workflow |
| `TESTER`    | Reported issue management and testing workflow |
| `USER`      | Standard application access                    |

---

# 🐞 Issue & Defect Management

BugTracker supports the complete issue lifecycle.

### Features

- Create and update issues
- Assign issues to developers
- Track issue status
- Set priority and severity
- Add issue descriptions
- Track issue reporter and assignee
- Add estimated effort points
- Filter issues by multiple attributes
- Search issues
- Sort issues
- Bulk issue operations
- Attach issues to Agile sprints
- Track resolution timestamps

### Supported Issue Operations

```text
Create Issue
      ↓
Assign Developer
      ↓
Set Priority & Severity
      ↓
Add to Sprint
      ↓
Development
      ↓
Testing
      ↓
Resolve / Close
```

---

# 📁 Project Management

Projects provide the primary workspace for organizing software development activities.

### Features

- Create projects
- Update project information
- Manage project members
- Track project issues
- Manage project sprints
- Project-level analytics
- Project backlog management

Each project maintains its own:

- Issues
- Backlog
- Sprints
- Members
- Analytics
- Workload information

---

# 🏃 Advanced Sprint Management

BugTracker provides a complete Agile Sprint Management workflow.

## Sprint Lifecycle

```text
PLANNED
   │
   ▼
ACTIVE
   │
   ├──────────────► EXTEND
   │
   ▼
COMPLETED
   │
   ▼
ARCHIVED
```

### Supported Sprint Operations

- Create Sprint
- Update Sprint
- Start Sprint
- Complete Sprint
- Extend Sprint
- Archive Sprint
- Delete Sprint safely
- Assign issues to Sprint
- Bulk assign backlog issues
- Move unfinished issues
- Rollover issues to another sprint
- Return issues to backlog

---

## 🟢 Single Active Sprint Rule

BugTracker enforces:

> Only one sprint can be `ACTIVE` for a project at a time.

This prevents overlapping execution cycles and maintains a clean Agile workflow.

---

# 📋 Advanced Backlog Management

The backlog contains issues that are not currently assigned to a sprint.

### Features

- Backlog filtering
- Text search
- Status filtering
- Priority filtering
- Severity filtering
- Issue type filtering
- Sorting
- Recommended priority sorting
- Backlog aging indicators
- Bulk issue selection
- Bulk sprint assignment
- Estimated effort visibility

### Recommended Priority

Issues can be prioritized based on:

- Severity
- Priority
- Issue age
- Resolution urgency

This helps teams identify the most important work first.

---

# 📊 Sprint Analytics

Each sprint provides real-time analytics calculated directly from database data.

### Analytics Include

- Total issues
- Completed issues
- Remaining issues
- Completion percentage
- Sprint health
- Sprint overdue status
- Days remaining
- Days overdue
- Team workload
- Capacity hours
- Estimated effort
- Burndown data

---

## 🏥 Sprint Health

Sprint health is dynamically calculated.

| Status         | Meaning                                   |
| -------------- | ----------------------------------------- |
| 🟢 `ON_TRACK`  | Sprint progress is meeting expectations   |
| 🟡 `AT_RISK`   | Sprint progress is slightly behind        |
| 🔴 `OFF_TRACK` | Sprint is significantly behind or overdue |

The calculation considers:

- Sprint duration
- Elapsed time
- Completion percentage
- Remaining issues
- Overdue status

---

# 📉 Sprint Burndown

BugTracker generates real burndown data using issue completion history.

The system compares:

- **Ideal Remaining Work**
- **Actual Remaining Work**

Example:

```text
Issues
10 ┤●
 9 ┤ ╲
 8 ┤  ●
 7 ┤   ╲
 6 ┤    ●
 5 ┤     ╲
 4 ┤      ●
 3 ┤       ╲
 2 ┤        ●
 1 ┤         ●
 0 ┼──────────────
    Day 1 → Day 10
```

Burndown data is based on actual issue resolution history.

If sufficient historical data is unavailable, the system returns an appropriate empty state instead of displaying fake chart data.

---

# 👨‍💻 Capacity Planning

Sprint capacity can be configured using:

- Estimated team members
- Working days
- Hours per day

### Capacity Formula

```text
Total Capacity Hours
=
Team Members
×
Working Days
×
Hours Per Day
```

### Example

```text
5 Team Members
×
10 Working Days
×
6 Hours Per Day

=
300 Capacity Hours
```

Capacity is displayed separately from story points and issue counts.

---

# ⚖️ Workload Analysis

## Module 4: Optimization & Finalization

The Analytics page includes a Milestone 4 tab with quality KPIs, database
performance checks, and an admin-only developer workload matrix.

The backend uses PostgreSQL composite indexes, a 20-connection SQLAlchemy pool
with 10 overflow connections, and paginated issue search via `skip`/`limit`.

Run the full stack with `docker compose up --build`. For local development,
run `alembic upgrade head` and `uvicorn app.main:app --reload` from `backend`.
Open Swagger at `http://127.0.0.1:8000/docs`; see
[API_DOCUMENTATION.md](API_DOCUMENTATION.md) for endpoint examples.

The system calculates workload distribution across team members.

Example:

| Developer   | Assigned Issues |
| ----------- | --------------: |
| Developer A |               8 |
| Developer B |               6 |
| Developer C |               5 |
| Unassigned  |               2 |

This helps identify workload imbalance during sprint planning.

---

# 🔄 Safe Issue Rollover

When a sprint is completed, unfinished issues are never deleted.

They can be:

### Option 1 — Return to Backlog

```text
ACTIVE SPRINT
      │
      ▼
COMPLETE SPRINT
      │
      ▼
Unfinished Issues
      │
      ▼
PROJECT BACKLOG
```

### Option 2 — Move to Another Sprint

```text
CURRENT SPRINT
       │
       ▼
COMPLETE
       │
       ▼
UNFINISHED ISSUES
       │
       ▼
NEXT SPRINT
```

This ensures:

- No data loss
- No orphaned issues
- Full traceability

---

# 🔔 Real-Time Notifications

BugTracker supports real-time notifications using WebSockets.

Notifications can be triggered for important system events such as:

- Sprint started
- Sprint completed
- Issue updates
- Assignment changes
- Workflow events

Connected users receive updates without manually refreshing the application.

---

# 📝 Audit Logging

Important system actions are recorded using immutable audit logs.

### Sprint Audit Actions

```text
SPRINT_CREATED
SPRINT_UPDATED
SPRINT_STARTED
SPRINT_EXTENDED
SPRINT_COMPLETED
SPRINT_ARCHIVED
SPRINT_DELETED
```

### Other Auditable Activities

- Issue creation
- Issue updates
- Status changes
- Assignment changes
- Project updates
- User actions

Audit logs improve:

- Traceability
- Accountability
- Debugging
- Compliance
- Activity monitoring

---

# 📄 Sprint PDF Reports

BugTracker generates professional Sprint Reports using **ReportLab**.

Reports are generated dynamically in memory.

### Report Contents

- Sprint information
- Sprint goal
- Start and end dates
- Sprint health
- Completion statistics
- Issue distribution
- Team workload
- Capacity information
- Estimated effort
- Generated timestamp
- Page numbering

### PDF Workflow

```text
User
 │
 ▼
Request Sprint Report
 │
 ▼
FastAPI Endpoint
 │
 ▼
Fetch Sprint Data
 │
 ▼
Calculate Analytics
 │
 ▼
Generate PDF in Memory
 │
 ▼
StreamingResponse
 │
 ▼
Browser Download
```

No temporary PDF files need to be permanently stored on the server.

---

# 📈 Advanced Analytics & Reporting

The backend provides analytics for projects, issues, developers, and system activity.

## Analytics Endpoints

| Endpoint                                  | Method | Access        | Description                          |
| ----------------------------------------- | ------ | ------------- | ------------------------------------ |
| `/analytics/overview`                     | `GET`  | ADMIN         | System-wide analytics                |
| `/analytics/issues/status-distribution`   | `GET`  | Authenticated | Issue status distribution            |
| `/analytics/issues/severity-distribution` | `GET`  | Authenticated | Severity distribution                |
| `/analytics/issues/trends`                | `GET`  | Authenticated | Issue creation and resolution trends |
| `/analytics/projects`                     | `GET`  | Authenticated | Project analytics                    |
| `/analytics/projects/{project_id}`        | `GET`  | Authenticated | Single project analytics             |
| `/analytics/reports/issues/export`        | `GET`  | Authenticated | CSV issue export                     |
| `/analytics/developers`                   | `GET`  | ADMIN         | Developer performance metrics        |

---

# 📊 Developer Analytics

Developer metrics include:

- Assigned issues
- Resolved issues
- Resolution rate
- Average resolution time
- Workload distribution

Access is restricted to administrators for system-wide metrics.

---

# 🔒 RBAC Isolation Rules

BugTracker applies role-based data isolation.

### ADMIN

```text
✓ System-wide access
✓ Manage users
✓ Manage projects
✓ Manage sprints
✓ View analytics
✓ Manage issues
```

### DEVELOPER

```text
✓ Assigned issue access
✓ Development workflow
✓ Limited project access
✗ System-wide administration
```

### TESTER

```text
✓ Report issues
✓ Access reported issues
✓ Testing workflow
✗ Sprint administration
```

---

# 🏗️ Technology Stack

| Technology     | Purpose                      |
| -------------- | ---------------------------- |
| **Python**     | Backend programming language |
| **FastAPI**    | REST API framework           |
| **PostgreSQL** | Primary relational database  |
| **SQLAlchemy** | ORM and database operations  |
| **Alembic**    | Database migrations          |
| **Pydantic**   | Validation and serialization |
| **JWT**        | Authentication               |
| **WebSocket**  | Real-time communication      |
| **ReportLab**  | PDF generation               |
| **Pytest**     | Automated testing            |

---

# 📂 Project Structure

```text
backend/
│
├── alembic/
│   ├── env.py
│   └── versions/
│       └── Database migration files
│
├── app/
│   │
│   ├── database/
│   │   ├── base.py
│   │   └── session.py
│   │
│   ├── models/
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── issue.py
│   │   ├── sprint.py
│   │   └── audit_log.py
│   │
│   ├── schemas/
│   │   ├── user.py
│   │   ├── project.py
│   │   ├── issue.py
│   │   └── sprint.py
│   │
│   ├── routes/
│   │   ├── auth.py
│   │   ├── users.py
│   │   ├── projects.py
│   │   ├── issues.py
│   │   ├── sprints.py
│   │   └── analytics.py
│   │
│   ├── services/
│   │   ├── auth_service.py
│   │   ├── issue_service.py
│   │   ├── sprint_service.py
│   │   ├── analytics_service.py
│   │   └── pdf_service.py
│   │
│   ├── utils/
│   │   ├── security.py
│   │   └── dependencies.py
│   │
│   └── main.py
│
├── tests/
│
├── requirements.txt
├── alembic.ini
└── README.md
```

---

# ⚙️ Installation

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/AjayKumarKR07/Bugtracker.git
cd Bugtracker/backend
```

---

## 2️⃣ Create Virtual Environment

### Windows PowerShell

```powershell
python -m venv .venv
```

Activate:

```powershell
.\.venv\Scripts\Activate.ps1
```

---

## 3️⃣ Install Dependencies

```powershell
pip install -r requirements.txt
```

---

# 🔧 Environment Configuration

Copy the environment example file:

```powershell
Copy-Item .env.example .env
```

Configure required values.

Example:

```env
DATABASE_URL=postgresql+asyncpg://username:password@localhost/bugtracker

SECRET_KEY=your_secret_key

ALGORITHM=HS256

ACCESS_TOKEN_EXPIRE_MINUTES=60
```

> Never commit your `.env` file to version control.

---

# 🗄️ Database Setup

Ensure PostgreSQL is running.

Create the required database:

```text
bugtracker
```

Update the database URL in your `.env` file.

---

# 🔄 Run Database Migrations

Apply all Alembic migrations:

```powershell
alembic upgrade head
```

Check the current migration:

```powershell
alembic current
```

View migration history:

```powershell
alembic history
```

---

# ▶️ Run the Development Server

```powershell
uvicorn app.main:app --reload --port 8000
```

The API will start at:

```text
http://127.0.0.1:8000
```

---

# 📚 API Documentation

FastAPI automatically provides interactive API documentation.

### Swagger UI

```text
http://127.0.0.1:8000/docs
```

### ReDoc

```text
http://127.0.0.1:8000/redoc
```

---

# ❤️ Health Check

| Endpoint      | Expected Response             |
| ------------- | ----------------------------- |
| `GET /`       | BugTracker API status message |
| `GET /health` | Backend health status         |
| `GET /docs`   | Swagger UI                    |

Example:

```json
{
  "status": "healthy",
  "service": "BugTracker API"
}
```

---

# 🏃 Sprint API Overview

| Endpoint                                | Method   | Description            |
| --------------------------------------- | -------- | ---------------------- |
| `/sprints`                              | `POST`   | Create sprint          |
| `/sprints`                              | `GET`    | List sprints           |
| `/sprints/{id}`                         | `GET`    | Get sprint             |
| `/sprints/{id}`                         | `PATCH`  | Update sprint          |
| `/sprints/{id}/start`                   | `POST`   | Start sprint           |
| `/sprints/{id}/complete`                | `POST`   | Complete sprint        |
| `/sprints/{id}/extend`                  | `POST`   | Extend sprint          |
| `/sprints/{id}/archive`                 | `POST`   | Archive sprint         |
| `/sprints/{id}`                         | `DELETE` | Delete sprint safely   |
| `/sprints/{id}/analytics`               | `GET`    | Sprint analytics       |
| `/sprints/{id}/report`                  | `GET`    | Download PDF report    |
| `/sprints/project/{project_id}/summary` | `GET`    | Project sprint summary |

---

# 📋 Backlog API Overview

| Endpoint                               | Method | Description                      |
| -------------------------------------- | ------ | -------------------------------- |
| `/issues?project_id={id}&backlog=true` | `GET`  | Get project backlog              |
| `/issues/bulk-assign-sprint`           | `POST` | Assign multiple issues to sprint |

---

# 🧪 Testing

Run backend tests:

```powershell
pytest
```

Run tests with detailed output:

```powershell
pytest -v
```

---

# 🔍 Code Quality

Recommended checks:

```powershell
flake8
```

Type checking:

```powershell
mypy app
```

---

# 🛡️ Data Integrity & Safety

BugTracker applies several safeguards:

- Cross-project sprint assignment validation
- Single active sprint per project
- Safe sprint deletion rules
- Unfinished issue rollover
- No issue data loss during sprint completion
- PostgreSQL enum migration support
- Audit logging for important actions
- Role-based authorization
- Transactional bulk operations

---

# 🗺️ System Workflow

```text
PROJECT
   │
   ├── BACKLOG
   │      │
   │      └── Issues
   │
   └── SPRINT
          │
          ├── PLANNED
          │
          ▼
        ACTIVE
          │
          ├── Issue Development
          ├── Testing
          └── Resolution
          │
          ▼
       COMPLETED
          │
          ├── Rollover Remaining Issues
          │
          ▼
       ARCHIVED
```

---

# 📦 Reporting

## CSV Reports

Issue data can be exported in CSV format for:

- Project analysis
- External reporting
- Management review
- Spreadsheet analysis

---

## PDF Sprint Reports

Sprint reports provide a structured overview of sprint execution and performance.

Reports include:

```text
Sprint Details
Sprint Goal
Progress Metrics
Sprint Health
Issue Statistics
Team Workload
Capacity Information
Estimated Effort
Report Timestamp
Page Numbers
```

---

# 🛣️ Development Roadmap

## ✅ Completed

- [x] Project foundation
- [x] PostgreSQL database integration
- [x] Alembic migrations
- [x] JWT authentication
- [x] Email OTP
- [x] Role-Based Access Control
- [x] Project management
- [x] Issue tracking
- [x] Comments
- [x] File attachments
- [x] Audit logging
- [x] Real-time notifications
- [x] Advanced analytics
- [x] CSV reporting
- [x] Agile sprint planning
- [x] Advanced backlog management
- [x] Sprint analytics
- [x] Burndown data
- [x] Capacity planning
- [x] PDF sprint reports

## 🚧 Planned Improvements

- [ ] Automated scheduled sprint reminders
- [ ] Email notification improvements
- [ ] Sprint templates
- [ ] Advanced velocity forecasting
- [ ] Machine-learning based issue prioritization
- [ ] CI/CD integration
- [ ] Docker deployment
- [ ] Kubernetes deployment
- [ ] Production monitoring
- [ ] Performance optimization

---

# 📌 Version History

## `v1.0.0`

### Major Features

- Advanced Sprint Planning
- Advanced Backlog Management
- Sprint Lifecycle Management
- Capacity Planning
- Sprint Health Analytics
- Real Burndown Data
- Team Workload Analysis
- Safe Issue Rollover
- Bulk Sprint Assignment
- Sprint PDF Reports
- Improved Audit Logging
- Enhanced RBAC Validation

---

# 🤝 Contributing

Contributions are welcome.

Recommended workflow:

```text
Fork Repository
      ↓
Create Feature Branch
      ↓
Develop Feature
      ↓
Run Tests
      ↓
Create Pull Request
      ↓
Code Review
      ↓
Merge
```

Before submitting changes:

```powershell
pytest
flake8
mypy app
```

---

# 🔐 Security

Please do not commit:

- `.env`
- Database passwords
- JWT secrets
- Email credentials
- API keys
- Production configuration files

Use environment variables for all sensitive configuration.

---

# 📄 License

This project is currently intended for educational and development purposes.

Add a production license before commercial deployment.

---

# 👨‍💻 Author

**BugTracker Development Team**

---

# ⭐ Project Status

🟢 **Actively Developed**

BugTracker `v1.0.0` currently provides a complete backend foundation for:

> **Defect Tracking + Project Management + Agile Sprint Planning + Backlog Management + Analytics + Real-Time Notifications + Reporting**

---

<p align="center">
  Built with ❤️ using FastAPI, PostgreSQL, SQLAlchemy and modern Agile principles.
</p>
# BugFlow-Nexus
BugFlow Nexus is a software issue tracking and resolution platform built with FastAPI, SQLAlchemy, SQLite, and Vanilla JavaScript. It helps organize, track, and manage software defects through a structured workflow.
from pathlib import Path

<div align="center">

