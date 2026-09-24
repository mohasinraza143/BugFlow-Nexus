# BugFlow-Nexus API Documentation

## Authentication Endpoints
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Login and receive a JWT token.
- `GET /auth/me`: Get current user profile.

## Issues Endpoints
- `GET /api/v1/issues`: List issues (Supports pagination `skip` and `limit`).
- `POST /api/v1/issues`: Create a new issue.
- `GET /api/v1/issues/{id}`: Get details of an issue.

## Analytics Endpoints
- `GET /api/v1/analytics/developer-workload`: Returns task load and average fix speed for each developer.

## Health Endpoint
- `GET /health`: Health check endpoint returning platform status and database connection.

For an interactive Swagger API documentation, run the application and visit `/docs`.
