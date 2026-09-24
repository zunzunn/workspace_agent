# Security Requirements

## Core principle

The agent has access to sensitive scheduling and potentially communication data. Security is a product feature, not a later add-on.

## Requirements

- OAuth with least-privilege scopes
- encrypted credentials at rest
- TLS in transit
- tenant isolation
- server-side authorization
- secure session management
- audit logs
- rate limiting
- input validation
- output validation
- secret management
- no tokens in logs
- no unnecessary retention
- safe webhook handling

## Agent-specific risks

### Prompt injection

External calendar descriptions, emails, documents, and chat messages may contain malicious instructions.

Retrieved content must be treated as **data**, not trusted agent instructions.

### Tool misuse

The agent must not be able to arbitrarily call tools outside its authorization context.

### Confused deputy

A user request should not grant the agent access to data the user themselves cannot access.

### Cross-tenant leakage

Team data must never be returned across tenant boundaries.

## Audit

Record:
- actor
- action
- target
- timestamp
- approval
- tool result
- final status
