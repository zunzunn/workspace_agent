# Requirements Traceability

## Requirement: Natural language scheduling

UI:
- AI Assistant

Backend:
- agent request API

Agent:
- intent parsing
- calendar tools
- scheduling engine

Database:
- agent run
- approval
- audit

Tests:
- scheduling scenarios
- ambiguity
- no availability
- stale state

## Requirement: Safe consequential actions

UI:
- approval card

Backend:
- approval service

Agent:
- risk classification

Database:
- approval record

Tests:
- approval required
- approval rejection
- expired approval
- mutation verification

## Requirement: Meeting preparation

UI:
- meeting workspace

Backend:
- context retrieval

Agent:
- preparation workflow

Tests:
- source availability
- missing context
- privacy boundaries
