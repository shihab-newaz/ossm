# 3. The OpenAPI document is the API contract

Status: accepted

## Context

The web app and the backend are built as separate slices and must not drift apart.

## Decision

`contract/openapi.yaml` is hand-authored and committed. The web app generates its TypeScript types from it and makes every call through the typed client. The backend serves its own `/v3/api-docs`, and a test fails when the set of operations and response codes differs from the committed contract. Errors use RFC 9457 problem details.

## Consequences

An API change is a contract change first. The backend check compares operations and status codes rather than full schemas, so schema detail is reviewed by humans and the generated client.
