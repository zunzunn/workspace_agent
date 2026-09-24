# Agent State Machine

A meeting task can move through these states:

```text
RECEIVED
  ↓
UNDERSTANDING
  ↓
PLANNING
  ↓
RETRIEVING_CONTEXT
  ↓
VALIDATING
  ↓
PROPOSED
  ↓
WAITING_FOR_APPROVAL
  ↓
EXECUTING
  ↓
VERIFYING
  ↓
COMPLETED
```

Alternative branches:

```text
VALIDATING → NEEDS_CLARIFICATION
VALIDATING → FAILED
EXECUTING → PARTIALLY_COMPLETED
EXECUTING → FAILED
VERIFYING → VERIFICATION_FAILED
```

## State rules

- A task must not jump directly from user request to successful mutation without required validation/approval.
- State transitions should be persisted for long-running tasks.
- UI should reflect state.
- Retries must not duplicate external mutations.
