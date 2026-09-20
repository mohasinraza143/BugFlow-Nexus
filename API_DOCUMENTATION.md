# BugTracker API Documentation

## Run locally

```powershell
cd backend
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Interactive references:

- Swagger: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`
- Health: `http://127.0.0.1:8000/health`

## Module 4 endpoints

### Developer workload

`GET /api/v1/analytics/developer-workload`

Requires an admin JWT. Returns every tester/developer with team, active tasks, completed fixes, and average MTTR in hours.

### Health check

`GET /health`

Expected response:

```json
{
  "status": "healthy",
  "service": "BugTracker API",
  "database": "postgresql"
}
```

### Paginated issue search

`GET /api/v1/issues/?skip=0&limit=20&search=login`

`page` and `page_size` remain supported for existing clients. Filters include `status`, `severity`, `priority`, `project_id`, `assignee_id`, and `sprint_id`.

## Quality and automation endpoints

- `POST /api/v1/webhooks/git`
- `GET /api/v1/analytics/quality-metrics`
- `GET /api/v1/analytics/defect-trends`
- `GET /api/v1/analytics/plotly-charts`
- `GET /api/v1/export/pdf`
- `GET /api/v1/export/csv`

Example webhook payload:

```json
{
  "commits": [
    {
      "id": "a7f8c92",
      "message": "fixes #2 login password crash"
    }
  ]
}
```

## Docker

```powershell
docker compose up --build
```

The FastAPI service listens on port `8000` and PostgreSQL uses persistent volume `bugtracker_postgres_data`.
