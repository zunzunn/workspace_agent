# Edge Cases

## Calendar

- overlapping meetings
- all-day events
- recurring events
- exceptions to recurring events
- deleted events
- cancelled events
- time zone changes
- daylight-saving transitions
- event moved externally
- duplicate events
- private events
- unavailable attendee calendars
- organizer permissions
- room/resource calendars

## Natural language

- "next Friday" ambiguity around locale/timezone
- "afternoon"
- "sometime next week"
- relative dates
- names shared by multiple people
- teams with similar names
- "my meeting" with multiple matches
- vague cancellation requests
- conflicting constraints

## Team

- member leaves team
- user changes role
- calendar disconnected
- user has multiple Google accounts
- external attendees
- guest permissions

## Agent

- tool timeout
- partial tool output
- conflicting evidence
- prompt injection in event descriptions
- hallucinated attendee
- stale availability
- repeated request
- duplicated action

## Principle

For every external mutation, assume the world may change between planning and execution. Revalidate when necessary.
