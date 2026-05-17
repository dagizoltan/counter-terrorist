# Developer Onboarding: Sovereign Security Orchestrator

## 1. Local Development Setup

### 1.1 Prerequisites
- **Deno**: `curl -fsSL https://deno.land/install.sh | sh`
- **Rust**: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- **Build Tools**: `sudo apt install build-essential pkg-config libssl-dev`

### 1.2 Initializing the Workspace
```bash
# 1. Clone and bootstrap
git clone <repo_url>
cd sovereign
deno task bootstrap

# 2. Build sidecars in debug mode
cd src/agents
cargo build

# 3. Start orchestrator in dev mode (bypasses TPM)
cd ../..
deno task dev
```

### 1.3 Environment Variables
Key variables in `.env`:
- `CTS_DEV_MODE=true`: Disables hardware integrity and allows in-place binary execution.
- `SHADOW_MODE=true`: Simulates blocks instead of enforcing them.
- `API_TOKEN`: Master token for administrative access.
- `MESH_SECRET`: Pre-shared key for gossip HMAC signatures.

## 2. Repository Organization

```
src/
  ├── agents/           # Rust sidecars (analyzer, sentinel, enforcer, etc.)
  ├── orchestrator/
  │   ├── app/          # Bootstrapper and main application logic
  │   ├── core/         # Framework, constants, and global ports
  │   ├── domain/       # DDD Business logic (Identity, Analysis, Protection)
  │   ├── infrastructure/ # System adapters (Persistence, Runtime, Executor)
  │   └── interface/    # Web UI (Hono + JSX) and API routes
tests/                 # Integration and security audit suites
scripts/               # Operational and maintenance scripts
volume/                # Local data storage (Storage, Forensics, Quarantine)
```

## 3. Coding Standards

### 3.1 Domain-Driven Design (DDD)
- **Domain Services**: Logic should reside in `src/orchestrator/domain/`. Services must be decoupled from infrastructure via interfaces (ports).
- **Dependency Injection**: Use the `ServiceContainer` for cross-service communication.

### 3.2 Security First
- **Never** use `Deno.Command` directly. Use `SystemExecutor` to ensure whitelist and jail enforcement.
- **Never** trust external paths. Always use `validatePath` before filesystem operations.
- **Async by Default**: Long-running operations should be non-blocking to keep the event loop responsive.

## 4. Testing
- Run unit and integration tests: `deno task test`
- Security Boundary verification: `deno run -A tests/security_audit.ts`
