# Inbox Specification

## Proposed purpose

The Inbox is the operational queue for things that require the user's attention.

It should combine:
- meeting invitations
- meeting changes
- agent approvals
- scheduling requests
- follow-up reminders
- important meeting-related notifications

## Inbox item types

### Approval
> Create Project X meeting tomorrow at 2:30 PM with 6 people?

Actions:
- approve
- edit
- reject

### Ambiguity
> I found two meetings with Alex.

Actions:
- choose

### External update
> Rahul moved the meeting to Friday.

Actions:
- view
- respond

### Agent recommendation
> This recurring meeting has been cancelled four times recently.

Actions:
- inspect
- keep
- modify

## UX goal

The Inbox should answer:

> "What requires my attention right now?"
