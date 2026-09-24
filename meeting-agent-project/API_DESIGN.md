# API Design

The backend should expose a clean application API separate from provider-specific Google APIs.

## Authentication

- POST /auth/google/start
- GET /auth/google/callback
- POST /auth/logout
- GET /auth/me

## Calendar

- GET /calendar/events
- GET /calendar/events/:id
- POST /calendar/events
- PATCH /calendar/events/:id
- DELETE /calendar/events/:id
- POST /calendar/availability

## Agent

- POST /agent/requests
- GET /agent/runs/:id
- POST /agent/runs/:id/approve
- POST /agent/runs/:id/reject

## Meetings

- GET /meetings
- GET /meetings/:id
- POST /meetings/:id/prepare
- GET /meetings/:id/activity

## Teams

- GET /teams
- GET /teams/:id
- GET /teams/:id/members

## Inbox

- GET /inbox
- POST /inbox/:id/approve
- POST /inbox/:id/dismiss

## Design rules

- provider errors should be translated into application-level errors
- mutations should be idempotent where practical
- return operation IDs for long-running agent work
- avoid exposing provider credentials
