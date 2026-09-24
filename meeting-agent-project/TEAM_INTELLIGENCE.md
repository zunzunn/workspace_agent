# Team and Organizational Intelligence

## Goal

The agent should eventually understand the user's organization beyond isolated calendar events.

## Concepts

- people
- teams
- roles
- projects
- reporting/working relationships where explicitly provided
- meeting relationships
- recurring collaboration patterns
- preferences

## Example

User:
> "Schedule the backend people."

The system should be able to resolve:
- team membership
- project responsibility
- role information

Only use information the product is authorized to access.

## Organizational graph

Conceptually:

```text
Person ── member_of ── Team
Person ── works_on ── Project
Person ── attends ── Meeting
Meeting ── belongs_to ── Project
```

## Important boundary

Do not infer sensitive personal attributes or make unsupported organizational conclusions.
