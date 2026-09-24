# Agent Architecture

## Core principle

Do not use multiple agents merely to satisfy a "multi-agent" label.

The architecture should use specialized components only when specialization improves reliability, observability, or maintainability.

## Recommended initial architecture

A central Meeting Orchestrator with specialized tools/services.

```text
User
  |
  v
Intent / Request Interpreter
  |
  v
Meeting Orchestrator
  |
  +--> Calendar Tools
  +--> People / Team Tools
  +--> Context Retrieval
  +--> Scheduling Engine
  +--> Meeting Intelligence
  +--> Approval Engine
  +--> Action Executor
  |
  v
Audit / Activity Log
```

## Why an orchestrator-first design

A single coordinator can:
- maintain task state
- reason about dependencies
- decide which tools to call
- avoid unnecessary agent-to-agent messaging
- make execution easier to debug

## Future specialization

Potential specialized agents/services:
- Scheduling Agent
- Meeting Preparation Agent
- Follow-up Agent
- Communication Agent
- Team Context Agent

These should be introduced when their boundaries become operationally useful.

## Agent loop

```text
Understand
  ↓
Plan
  ↓
Retrieve
  ↓
Validate
  ↓
Propose
  ↓
Approve if needed
  ↓
Execute
  ↓
Verify
  ↓
Report
```
