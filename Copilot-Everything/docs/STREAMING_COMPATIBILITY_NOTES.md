# Streaming Compatibility Notes

Date: 2026-03-19

## Current Stable Behavior

The stable in-app exact-mode path is buffered:

- plugin transport: Obsidian `requestUrl`
- canonical route used in live validation: `POST /v1/self-host/agent-turn`
- plugin setting used for live validation: `stream = false`

Evidence:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/backend-emulator-capture.json`
- `/Users/trevorrobey/THE Copilot in Obsidian Everything/configs/validation/inapp-backend-emulator-chat-after.txt`

## Current Streaming Route

The emulator still implements:

- `POST /v1/self-host/agent-turn/stream`

And the SSE order is fixture-locked in:

- `/Users/trevorrobey/THE Copilot in Obsidian Everything/backend/copilot-backend-emulator/tests/fixtures/stream-events.txt`

That route is contract-tested, but it is not the current stable in-app transport path.

## Why The Obsidian-Safe Path Is Buffered

This workspace now treats the following as the operative constraint:

- Obsidian `request()` and `requestUrl()` do not currently expose incremental streaming response bodies
- release-note and feature-request guidance provided in-session points to buffered behavior for the requestUrl-based CORS-safe path

That matches the live result already observed here:

- buffered canonical requests succeed
- SSE text returned over the same safe transport is not consumable as a true incremental stream in-app

## What True In-App Streaming Would Require

True live streaming would need a different transport layer, for example:

- desktop-only `fetch` where localhost/CORS behavior is safe and validated
- WebSocket transport
- another Obsidian-supported streaming-capable API if one becomes available

## Current Policy

- keep buffered canonical non-stream mode as the default stable path
- treat streaming as a separate transport-validation task
- do not block `/v0/*` Miyo compatibility work on live SSE
- preserve a buffered fallback for CORS-safe and mobile-safe operation

## Safety Notes

- any future live streaming path should be gated behind an explicit experimental setting
- desktop-only transport experiments should not silently replace the buffered default
- mobile-safe behavior still requires the buffered path today
