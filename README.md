# BugFlow-Nexus
BugFlow Nexus is a software issue tracking and resolution platform built with FastAPI, SQLAlchemy, SQLite, and Vanilla JavaScript. It helps organize, track, and manage software defects through a structured workflow.
from pathlib import Path

<div align="center">

# 🐞 BugFlow

### Issue Tracking & Resolution Platform

A project to organize software issues, follow their status, and make defect tracking easier.

**Built with FastAPI · SQLAlchemy · SQLite · Vanilla JavaScript**

</div>

---

## ✨ About BugFlow

**BugFlow** is a software issue tracking platform focused on recording defects and following them through a structured workflow. It brings issue information into one place so that issues can be reviewed, searched, and managed more clearly.

> BugFlow is an evolving personal project. This README describes the currently planned/core scope and should be updated as features are implemented.

## 🚀 Core Project Scope

- 🐞 **Issue reporting** — capture issue details in a structured format.
- 🔄 **Issue lifecycle tracking** — keep track of issue status as work progresses.
- 🧾 **Issue history** — maintain a history of issue changes through the `IssueHistory` model.
- 🔎 **Issue lookup** — retrieve issues from the API, including lookup by issue key.
- 🗂️ **Issue dashboard** — view issues in a central list with search and filtering UI.
- 📝 **Create issue page** — provide a dedicated page for submitting an issue.

*Only treat a feature as complete once it is implemented and working in your local version.*

## 🧰 Technology Stack

| Area | Technology |
|---|---|
| Backend API | FastAPI |
| ORM / database access | SQLAlchemy |
| Database | SQLite |
| Frontend | HTML, CSS, Vanilla JavaScript |
| Data validation | Pydantic |

## 🏗️ High-Level Architecture

```mermaid
flowchart LR
    U[User] --> UI[BugFlow Frontend]
    UI --> API[FastAPI REST API]
    API --> ORM[SQLAlchemy]
    ORM --> DB[(SQLite Database)]
    API --> HIST[Issue History]
    HIST --> DB


