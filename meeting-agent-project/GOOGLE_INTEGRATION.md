# Google Integration

## Primary integration

Google Calendar via OAuth.

## Initial capabilities

- OAuth sign-in
- read events
- search events
- inspect attendees
- inspect availability where permitted
- create events
- update events
- delete events
- recurring event handling

## Future integrations

- Gmail
- Google Meet
- Google Drive

## OAuth principles

- request only required scopes
- explain why each scope is needed
- securely store refresh credentials
- support disconnect/revoke
- avoid logging access tokens
- isolate tenant/user credentials
- verify OAuth state
- handle expired/revoked credentials

## Calendar concerns

Must handle:
- time zones
- recurring events
- event IDs
- organizer vs attendee permissions
- cancellations
- attendee notification behavior
- all-day events
- conference links
- event updates
- API quotas
- transient failures
