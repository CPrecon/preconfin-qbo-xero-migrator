# API Documentation

The API serves OpenAPI documentation at `/documentation` in development and production unless disabled by deployment policy.

Core endpoints:

- `GET /health`
- `GET /api/oauth/qbo/start`
- `GET /api/oauth/qbo/callback`
- `POST /api/oauth/qbo/disconnect`
- `POST /api/migration-jobs`
- `POST /api/migration-jobs/:id/run`
- `GET /api/migration-jobs/:id`
- `GET /api/migration-jobs/:id/downloads`
- `DELETE /api/migration-jobs/:id`
- `POST /api/leads`

Protected job endpoints require the migration token returned at job creation through either `x-migration-token` or `?token=`.
