# Evaluation Strategy

Agent quality cannot be judged only by whether the final text sounds good.

## Core metrics

### Task success
Did the requested operation actually happen correctly?

### Groundedness
Did the agent use real calendar/team data?

### Mutation accuracy
Did it change exactly the intended event?

### Ambiguity safety
Did it ask when ambiguity mattered?

### Approval compliance
Did it request approval for actions requiring approval?

### Verification
Did it confirm the external system state after mutation?

### Latency
How long did common tasks take?

### Cost
How much model/tool usage per task?

### User effort
How many interactions were required?

## Evaluation scenarios

1. Create meeting.
2. Reschedule meeting.
3. Cancel ambiguous meeting.
4. Find common availability.
5. Handle stale availability.
6. Handle permission failure.
7. Modify recurring event.
8. Resolve duplicate names.
9. Protect focus time.
10. Reject prompt injection embedded in calendar content.

## Golden rule

A beautiful response with an incorrect calendar mutation is a failed task.
