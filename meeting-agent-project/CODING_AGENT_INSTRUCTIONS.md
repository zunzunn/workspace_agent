# Coding Agent Instructions

## Mission

Implement Meeting Agent incrementally from the product and architecture documents in this folder.

## Rules

1. Read the relevant documentation before implementing a feature.
2. Do not invent requirements.
3. Keep provider integrations behind interfaces.
4. Never hard-code secrets.
5. Add tests for every mutation path.
6. Use real calendar state when claiming availability.
7. Implement approval before high-risk mutation.
8. Verify external mutations after execution.
9. Preserve auditability.
10. Keep commits small and understandable.

## Development order

1. repository structure
2. backend health/auth foundation
3. database schema
4. Google OAuth
5. calendar read
6. calendar search
7. availability engine
8. agent request endpoint
9. approval system
10. event creation
11. verification
12. dashboard
13. meeting detail
14. rescheduling/deletion
15. preparation
16. teams/inbox/chat

## Before coding

The coding agent should identify:
- existing repository structure
- chosen stack
- environment variables
- database
- deployment target
- available integrations

Do not overwrite existing project architecture without checking first.
