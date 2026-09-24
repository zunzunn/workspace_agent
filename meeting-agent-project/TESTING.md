# Testing Strategy

## Unit tests

Test:
- date parsing
- timezone handling
- constraint evaluation
- availability calculations
- action risk classification
- approval logic
- event patch generation

## Integration tests

Test:
- OAuth
- Google Calendar reads
- event creation
- updates
- deletion
- recurring events
- provider errors

## Agent tests

Use deterministic fixtures.

Example:
Input:
> "Move my client meeting to Friday afternoon."

Expected:
- correct event resolution
- Friday availability checked
- no unrelated events changed
- approval requested
- mutation verified after approval

## Adversarial tests

- ambiguous names
- prompt injection
- malicious event descriptions
- contradictory instructions
- stale state
- duplicate requests
- tool timeouts

## End-to-end

A complete test should cover:
request → planning → approval → execution → verification → UI result.
