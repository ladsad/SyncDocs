# Agent Rules for SyncDocs

These rules are derived from the project's design and contributing guidelines. The AI agent must adhere to them strictly when generating code, tests, or documentation for this repository.

## 1. Scope Discipline and Phase Progression

- **Strict adherence to phases**: Do not implement features outside the current active phase defined in `docs/ROADMAP.md` (e.g., no offline editing or custom rich-text engine for the MVP).
- **Exit criteria**: Do not move to the next phase until the current phase's exit criteria are demonstrably met and tests are written.
- **Target functionality**: SyncDocs is focused on real-time Operational Transformation and Google Workspace integration. Avoid over-engineering features outside this scope.

## 2. Code Style and Conventions

- **Formatting (Python)**: Always use `black` and `flake8`.
- **Formatting (JavaScript/TypeScript)**: Always use `eslint` and `prettier`.
- **Error Handling**: Use explicit exception handling in FastAPI routes. Ensure WebSocket connections close gracefully on errors.
- **Commenting**: Comment *why*, not *what*. This is especially critical for Operational Transformation (OT) algorithms and Google API integrations. The code should explain the mathematical convergence of the OT operations.

## 3. Concurrency and Synchronization

- **Operational Transformation**: All OT logic (`T(op1, op2)`) must be mathematically pure, deterministic, and side-effect free.
- **State Management**: The PostgreSQL database is the single source of truth. Ensure that database updates (e.g., appending to the operation log and updating the current revision) happen within atomic, serialized transactions to prevent race conditions.
- **WebSockets**: Handle WebSocket client disconnects cleanly without locking up server resources or discarding unacknowledged document states.

## 4. Testing Requirements

- **Backend (PyTest)**: Write unit tests for OT transformation functions, ensuring they satisfy convergence properties (e.g., using property-based testing).
- **Frontend (Jest)**: Test React components and the client-side OT synchronization logic.
- **Integration**: Write FastAPI `TestClient` and `pytest-asyncio` tests to verify REST API boundaries and real-time WebSocket communication.

## 5. Documentation and Process

- **Commit Messages**: Use conventional commits (e.g., `feat(api): add sync`, `fix(ot): resolve transformation bug`). **All modified files need to be committed with proper messaging, every time work is done.**
- **Updates**: When adding API routes or WebSocket events, update `docs/API.md`.
- **Changelog**: Update `CHANGELOG.md` under `[Unreleased]` for notable changes.
