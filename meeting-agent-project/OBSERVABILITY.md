# Observability

## Agent run logging

Capture:
- run ID
- user/tenant
- intent classification
- tools called
- tool latency
- approval state
- execution status
- verification status
- errors
- model metadata

Do not log:
- access tokens
- unnecessary private content
- secrets

## Metrics

- agent success rate
- approval acceptance rate
- clarification rate
- tool failure rate
- mutation verification rate
- average latency
- provider API errors
- retry counts

## Tracing

A single request should be traceable across:
frontend → API → agent → tool → Google → verification → response.
