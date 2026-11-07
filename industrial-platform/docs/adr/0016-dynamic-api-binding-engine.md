# ADR-0016: Dynamic API Management & Data Binding Engine

## Status
Accepted

## Context
Page Builder users must connect arbitrary REST JSON APIs, explore nested structures, bind fields to component props/inputs, and later repeat over arrays — without assuming a fixed response shape.

## Decision
1. Evolve existing `data_sources` (`http_json`) and `data_bindings` entities; do not introduce a parallel product surface.
2. Store optional `fieldPath` (JSONPath-style) on `data_source_signal` bindings for bind-time nested selection; keep query-level `jsonPath` for backward compatibility.
3. Persist response samples and inferred JSON Schema versions in `api_response_samples` / `api_schemas`, separate from live page documents.
4. Centralize all resolution in `live_values` / runtime; components never call external APIs.
5. Represent repeaters as document nodes (`type: "repeater"`) with a source binding and child template; runtime expands instances.
6. Do not add Zustand; Studio keeps hooks + catalog patterns.

## Consequences
- New Alembic migration for samples/schemas and `data_sources.description` / `enabled`.
- Binding contract and OpenAPI grow; published bundles snapshot binding specs including `fieldPath`.
- Schema changes warn via binding-health; bindings are never auto-deleted.
