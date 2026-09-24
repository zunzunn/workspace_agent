# Tool Contracts

Tools are the controlled interface between the agent and external systems.

## Calendar tools

### calendar.search_events
Inputs:
- user
- date range
- optional participant
- optional query

Returns:
- matching event IDs
- titles
- start/end
- attendees
- recurrence information
- source metadata

### calendar.get_event
Returns full event details.

### calendar.find_availability
Inputs:
- participants
- date range
- duration
- working hours
- buffer requirements
- preferences

Returns candidate slots with explanations.

### calendar.create_event
Inputs:
- title
- start/end
- timezone
- attendees
- description
- conferencing options

Requires approval for consequential external creation.

### calendar.update_event
Requires:
- event ID
- patch
- approval context where required

### calendar.delete_event
Requires:
- event ID
- explicit confirmation

## Context tools

### people.resolve
Resolve names, teams, roles, and relationships.

### meeting.get_context
Retrieve authorized context for a meeting.

### meeting.prepare
Generate a meeting brief from retrieved evidence.

## Communication tools

Potential future tools:
- gmail.search
- gmail.draft
- gmail.send

Sending should require explicit approval by default.

## Verification

Every mutation tool should return:
- success/failure
- external object ID
- final authoritative state where possible
- error code
- human-readable status
