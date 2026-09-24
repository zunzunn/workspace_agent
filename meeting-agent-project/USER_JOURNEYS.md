# User Journeys

## Journey 1 — Schedule a meeting

User:
> "Schedule a 30-minute meeting with the marketing team next week."

System:
1. Understand intent.
2. Resolve "marketing team" to people.
3. Check authorized calendars.
4. Apply user preferences.
5. Generate candidate times.
6. Explain relevant constraints.
7. Ask for approval if the action is consequential.
8. Create the event after approval.
9. Confirm the actual calendar result.
10. Show the created event.

## Journey 2 — Reschedule

User:
> "Move tomorrow's client meeting to Friday afternoon."

System:
1. Resolve the target event.
2. Check Friday availability.
3. Generate options.
4. Ask for confirmation.
5. Apply the change.
6. Verify the external calendar.
7. Report the exact change.

## Journey 3 — Ambiguous cancellation

User:
> "Cancel my meeting with Alex."

If multiple matching events exist:
- show the minimal set of candidates
- ask which event
- do not guess

## Journey 4 — Meeting preparation

User:
> "Prepare me for tomorrow's client meeting."

System gathers authorized context:
- participants
- prior meetings
- agenda
- relevant project information
- open action items
- unresolved questions

Then produces a concise brief.

## Journey 5 — Post-meeting follow-up

After the meeting:
- summarize
- identify decisions
- identify action items
- identify owners and deadlines where evidence exists
- draft follow-up
- request approval before sending
