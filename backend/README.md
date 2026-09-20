# 🐞 BugTracker — Backend

> **Intelligent Software Defect Tracking & Agile Project Management System**

A production-oriented FastAPI backend for managing software defects, projects, users, Agile sprints, backlogs, analytics, audit logs, notifications, and reports.

---

## 🚀 Version

**Current Version:** `v1.0.0`  
**Status:** 🟢 Active Development  
**Latest Milestone:** Advanced Sprint Planning & Backlog Management

---

## 📌 Overview

BugTracker is an intelligent software defect tracking system designed to support the complete software issue management lifecycle.

The backend provides:

- 🔐 Secure JWT authentication
- 👥 Role-Based Access Control (RBAC)
- 🐞 Advanced issue and defect tracking
- 📁 Project management
- 🏃 Agile Sprint Planning
- 📋 Backlog Management
- 📊 Real-time Sprint Analytics
- 📉 Sprint Burndown Data
- 👨‍💻 Team Workload Analysis
- 🔔 Real-time WebSocket notifications
- 📝 Audit logging and activity tracking
- 💬 Issue comments
- 📎 File attachments
- 📈 Advanced analytics and reporting
- 📄 CSV and PDF report generation

---

# 🏗️ Technology Stack

| Technology | Purpose |
| --- | --- |
| **Python** | Backend programming language |
| **FastAPI** | REST API framework |
| **PostgreSQL** | Primary relational database |
| **SQLAlchemy** | ORM and database operations |
| **Alembic** | Database schema migrations |
| **Pydantic** | Data validation and serialization |
| **JWT** | Authentication and authorization |
| **WebSocket** | Real-time notifications |
| **ReportLab** | PDF report generation |
| **Pytest** | Backend testing |

---

# 📂 Project Structure

```text
backend/
│
├── alembic/
│   └── versions/
│       └── Database migration files
│
├── app/
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
