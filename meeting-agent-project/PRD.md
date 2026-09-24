# Product Requirements Document

## 1. Product

Meeting Agent — an AI-powered meeting and team workspace for small businesses.

## 2. Primary user

Small business teams and the people responsible for coordinating work and meetings.

## 3. Core problem

Teams spend significant effort:
- finding meeting times
- resolving scheduling conflicts
- understanding meeting context
- preparing agendas
- tracking decisions
- remembering follow-ups
- coordinating people
- maintaining calendar hygiene

Traditional calendars store events but do not understand the broader work context.

## 4. Core product promise

Users can express meeting-related goals in natural language, while the agent handles research, planning, verification, and authorized execution.

## 5. Core product areas

### Dashboard
A visually clear daily/weekly command center.

### Calendar
Calendar visualization plus AI actions.

### Inbox
A place for incoming meeting activity, agent requests, approvals, and relevant communication.

### Teams
People, roles, projects, team relationships, and scheduling context.

### Group Chats
Team conversations with optional AI participation.

### Meetings
A dedicated workspace for meeting preparation, notes, decisions, action items, and follow-up.

### AI Assistant
The natural-language interface for meeting operations.

## 6. Functional requirements

The system should eventually support:
- read calendar events
- create events
- update events
- delete/cancel events
- search events
- find availability
- detect conflicts
- suggest times
- schedule meetings
- manage attendees
- manage recurring events
- prepare meeting briefs
- generate agendas
- summarize meetings
- extract decisions
- extract action items
- create follow-up tasks
- draft follow-up communication
- maintain user preferences
- maintain team context
- show agent actions
- require approval for consequential actions
- explain ambiguity
- provide an audit trail

## 7. Trust requirements

The agent must:
- never silently guess when ambiguity could cause a consequential action
- distinguish suggestions from executed actions
- clearly show what it intends to change
- clearly show what actually changed
- preserve an action history
- respect authorization boundaries
- avoid claiming an action succeeded until the underlying tool confirms it

## 8. Non-functional requirements

- Fast perceived response
- Clear progress states for longer agent operations
- Reliable tool execution
- Idempotent calendar mutations where possible
- Strong error handling
- Secure OAuth/token handling
- Observable agent actions
- Recoverable failures
- Accessible UI
- Responsive UI

## 9. MVP principle

The MVP should demonstrate one coherent meeting lifecycle rather than a large collection of disconnected features.
