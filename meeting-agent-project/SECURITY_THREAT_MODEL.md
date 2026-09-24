# Security Threat Model

## Assets

- calendar data
- identity
- OAuth credentials
- team data
- meeting notes
- messages
- agent actions

## Threats

### Prompt injection
Untrusted external content attempts to control the agent.

### Credential theft
OAuth credentials are exposed.

### Unauthorized mutation
Agent performs actions outside user's authorization.

### Cross-user leakage
One user's private information is shown to another.

### Cross-tenant leakage
Data from one organization becomes visible to another.

### Replay
An old approval is reused for a new state.

### Stale proposal
A previously approved plan is executed against changed calendar state.

## Mitigations

- least privilege
- authorization on every tool call
- approval expiry
- state revalidation
- encrypted secrets
- tenant isolation
- audit logs
- untrusted-content boundaries
- idempotency keys
- mutation verification
