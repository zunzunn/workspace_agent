# Backend Architecture

## Responsibilities

- authentication
- tenant/user authorization
- provider integrations
- agent orchestration
- tool execution
- scheduling logic
- approval management
- persistence
- audit logs
- background jobs
- observability

## Suggested logical modules

```text
backend/
├── auth/
├── users/
├── teams/
├── calendar/
├── meetings/
├── agent/
├── tools/
├── approvals/
├── inbox/
├── chats/
├── integrations/
├── jobs/
├── audit/
└── common/
```

## Provider boundary

Google-specific code should be isolated from business logic.

Example:

```text
Application Calendar Service
        |
        v
CalendarProvider interface
        |
        +--> GoogleCalendarProvider
        +--> FutureProvider
```

This keeps the product from being permanently coupled to one provider.
