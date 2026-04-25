# Implementation Scaffold Plan: Security Orchestrator

This plan outlines the concrete steps to implement the architecture defined in `ARCHITECTURE_DISCUSSION.md`.

## Phase 1: Environment Setup & Bootstrapping

1.  **Initialize Project Structure:**
    - Create the top-level directories: `orchestrator/`, `agents/`, `shared/`, `config/`.
2.  **Deno Bootstrapper (`orchestrator/bootstrapper.ts`):**
    - Implement OS detection (`Deno.build.os`).
    - Define dependency checklists for Windows, Linux, and macOS.
    - Implement a tool to check for `cargo` and suggest installation if missing.
    - Implement a "Hello World" sidecar execution test to verify `Deno.Command` integration.

## Phase 2: Deno Orchestrator Backend (Hono)

1.  **Initialize Hono Server (`orchestrator/main.ts`):**
    - Setup basic routing.
    - Integrate `hono/jsx` for SSR.
2.  **Layout & Dashboard:**
    - Create a base HTML layout using JSX.
    - Implement a "System Status" dashboard page.
3.  **Real-time Communication:**
    - Implement a WebSocket endpoint for streaming system events (e.g., `/api/ws/events`).

## Phase 3: Rust Sidecar Agents

1.  **Common Agent Framework (`agents/common/`):**
    - Define a shared JSON schema for communication between Deno and Rust.
2.  **Initial Scanner Implementation:**
    - **Linux:** Port basic `ss` and `systemctl` checks to a Rust binary.
    - **macOS:** Port `launchctl` and `system_profiler` checks.
    - **Windows:** Implement basic Registry and Process auditing.
3.  **Active Blocking PoC:**
    - Implement a controlled "Process Kill" command in the Rust agent triggered by the Deno orchestrator.

## Phase 4: Frontend "Islands" (Web Components)

1.  **Define Base Components:**
    - `security-status-card`: Displays severity-colored status.
    - `audit-log-streamer`: A custom element that connects to the WebSocket and renders incoming findings.
2.  **Integrate with JSX:**
    - Use the custom elements within the Hono/JSX templates.

## Phase 5: Persistence & Baselines

1.  **Deno KV / SQLite Integration:**
    - Store the initial system state as a baseline.
    - Implement drift detection (alerting when new services/startup items appear).
