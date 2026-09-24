# Approval and Verification System

## Principle

The system separates:

1. Proposal
2. Approval
3. Execution
4. Verification

## Action risk classes

### Low risk
Examples:
- read calendar
- summarize
- find availability
- generate suggestions

Can generally execute automatically.

### Medium risk
Examples:
- create personal planning blocks
- prepare drafts
- modify internal-only metadata

Configurable.

### High risk
Examples:
- send invitations
- cancel meetings
- modify recurring meetings
- send messages
- change meetings affecting other people

Require confirmation by default.

## Approval object

Conceptually:

```json
{
  "action_id": "...",
  "action_type": "calendar.create_event",
  "summary": "Create Project X Sync",
  "proposed_changes": {},
  "affected_people": [],
  "risk_level": "high",
  "expires_at": "...",
  "status": "pending"
}
```

## Verification

After execution:
- call the authoritative read endpoint
- compare actual state to intended state
- mark verified only after confirmation

## Failure

If execution fails:
- preserve approval record
- report failure
- do not pretend success
- offer recovery options
