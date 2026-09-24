# Meeting Agent — Project Documentation

## What this project is

Meeting Agent is a full-stack AI workspace for small business teams. Its core purpose is to understand a team's meetings and help users plan, schedule, prepare for, manage, and follow up on those meetings.

The product is **not intended to be merely a chat interface for Google Calendar**. Calendar is an important system of record, while the Meeting Agent provides an intelligence and action layer over the team's work.

Core idea:

> **Google Calendar tells you what meetings exist. Meeting Agent helps you accomplish what those meetings are supposed to accomplish.**

## Product direction

The envisioned product contains:
- AI assistant / meeting agent
- Dashboard
- Calendar
- Inbox
- Teams
- Group chats
- Meeting workspace
- Meeting preparation
- Scheduling and conflict resolution
- Meeting follow-up
- Team / organizational context
- Agent memory and user preferences
- Google Calendar integration
- Potential Gmail / Google Meet integrations
- Approval and verification before consequential actions

## Current product principle

The agent should be autonomous where actions are low-risk and should ask for confirmation before consequential external actions.

> **Agent proposes → User verifies → Agent executes**

## Primary target

Small business teams.

## Current product status

This is the planning stage. Product scope, exact agent architecture, final information architecture, and some high-risk autonomy rules are intentionally still open for design.

## Important design principle

Do not build features simply because they sound "agentic." Every agent capability should solve a real user problem and have a clear tool/action boundary.
