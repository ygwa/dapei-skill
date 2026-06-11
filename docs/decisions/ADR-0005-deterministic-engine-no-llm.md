---
id: ADR-0005
title: "The engine never calls LLMs"
status: accepted
date: 2026-05-15
deciders: [ygwa]
---

## Problem Statement

A capability engine that calls LLMs internally is non-deterministic, slow in tests, expensive in CI, and impossible to audit.

## Decision

The engine is 100% deterministic. All LLM calls happen in the chat session, OUTSIDE the engine. The AI drives `runCapability(id, input, ctx)` calls; the engine only validates and persists.

## Consequences

### Positive
- CI is fast and deterministic
- No API key required to run tests
- Audit log captures every engine action
- Engine can be replayed offline

### Negative
- AI must do all semantic work (good — that's what AI is for)
- Cannot lazily "ask the LLM" from inside a capability
