# Architecture and Product Decisions

## Decision format

Each decision should record:
- date
- decision
- alternatives considered
- rationale
- consequences

## Current decisions

### Product
**Decision:** Build a Meeting Agent for small business teams.

### UX
**Decision:** Use a visually clean dashboard with compact actionable cards.

### Trust
**Decision:** Consequential actions should require verification/approval by default.

### Ambiguity
**Decision:** The agent should ask targeted clarification questions rather than silently guessing when the ambiguity could cause a consequential action.

### Differentiation
**Decision:** Focus on meeting lifecycle intelligence and organizational context rather than only calendar CRUD.

### Architecture
**Decision:** Start with a central orchestrator plus controlled tools/services rather than creating many agents purely for appearance.

## Pending decisions

See OPEN_QUESTIONS.md.
