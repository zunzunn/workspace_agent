# Frontend Specification

## Main shell

Recommended layout:

```text
┌────────────────────────────────────────────────────┐
│ Logo       Search / AI Assistant       Profile     │
├──────────┬─────────────────────────────────────────┤
│ Dashboard│                                         │
│ Inbox    │               Main Content              │
│ Calendar │                                         │
│ Meetings │                                         │
│ Teams    │                                         │
│ Chats    │                                         │
│ Settings │                                         │
└──────────┴─────────────────────────────────────────┘
```

## Dashboard

Primary widgets:
- today's agenda
- upcoming meetings
- pending approvals
- agent recommendations
- recent activity

## Visual language

- clean
- professional
- generous spacing
- rounded surfaces
- concise text
- clear primary actions
- low visual noise

## Agent interaction

Use:
- chat composer
- inline action cards
- confirmation cards
- progress indicators
- source/context drawers
- activity timeline

## Important states

Every agent operation needs:
- idle
- planning
- waiting for input
- awaiting approval
- executing
- verifying
- completed
- partially completed
- failed
