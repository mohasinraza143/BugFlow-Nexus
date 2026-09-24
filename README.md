# BugFlow-Nexus

BugFlow-Nexus is an Enterprise Software Defect Tracking, Sprints & Quality Intelligence System.

## Features
- Real-time Sprint Analytics
- Developer Workload Matrix
- High-Performance Database (PostgreSQL with Indexes & Connection Pooling)
- Secure Authentication (JWT, Role-Based Access Control)

## Quick Start (Docker)
Ensure you have Docker and Docker Compose installed.

1. Clone the repository.
2. Run the application:
   ```bash
   docker-compose up --build
   ```
3. The API will be available at `http://localhost:8000`.
4. The interactive API documentation will be available at `http://localhost:8000/docs`.

## Running Pytest
```bash
cd backend
pip install -r requirements.txt
pytest tests/ -v
```
