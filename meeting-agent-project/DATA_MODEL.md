# Data Model

Conceptual entities.

## User

- id
- tenant_id
- name
- email
- timezone
- preferences

## Team

- id
- tenant_id
- name
- description

## TeamMember

- team_id
- user_id
- role

## CalendarConnection

- id
- user_id
- provider
- provider_account_id
- scopes
- encrypted credential reference
- status

## CalendarEvent

Local representation/cache only where necessary:
- provider_event_id
- calendar_connection_id
- title
- start
- end
- timezone
- organizer
- attendees
- recurrence
- last_synced_at

## Meeting

Product-level object:
- id
- team_id
- calendar_event_id
- purpose
- agenda
- preparation
- notes
- decisions
- action_items
- follow_up_state

## AgentAction

- id
- user_id
- tenant_id
- action_type
- target
- proposal
- approval_status
- execution_status
- verification_status
- created_at
- completed_at
- error

## UserPreference

Examples:
- earliest meeting time
- latest meeting time
- default duration
- buffer
- lunch protection
- focus time
- preferred days
