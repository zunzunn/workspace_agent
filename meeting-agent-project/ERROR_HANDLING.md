# Error Handling and Recovery

## Error classes

### User ambiguity
Example:
- two matching events

Response:
- ask targeted question

### No availability
Response:
- explain no common slot
- offer nearest alternatives

### Permission denied
Response:
- explain missing permission
- provide reconnect/authorization path

### Provider failure
Response:
- retry safe operations
- preserve state
- report if unresolved

### Partial success
Example:
- event created but notification step failed

Response:
- show exact completed and incomplete operations

### Stale data
Example:
- availability changed after proposal

Response:
- re-check before mutation
- show that previous proposal is stale

## Retry policy

Only automatically retry operations that are safe and idempotent.

Never blindly retry destructive actions.

## User messaging

Bad:
> Something went wrong.

Good:
> Google Calendar rejected the change because the event was modified after we created the proposal. I rechecked the calendar and found two new available times.
