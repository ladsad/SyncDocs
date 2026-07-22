# Testing Strategy

SyncDocs enforces a strict software quality standard through comprehensive automated testing.

## Backend (Python / FastAPI)

We use `pytest` for all backend testing.

- **Unit Tests**: Target the OT algorithms independently. Given the complexity of OT, exhaustive unit tests with property-based testing are required to ensure transformation functions (`T(op1, op2)`) always satisfy convergence properties.
- **Integration Tests**: Target FastAPI REST endpoints using `TestClient`. Ensure database state and Google API mock interactions behave as expected.
- **WebSocket Tests**: Use `pytest-asyncio` to simulate concurrent WebSocket clients and verify real-time state synchronization.

Run tests:
```bash
pytest --cov=app tests/
```

## Frontend (React)

We use `Jest` and `React Testing Library`.

- **Component Tests**: Ensure the UI renders correctly and handles user input.
- **OT Client Tests**: Verify that local edits are correctly buffered, transformed against incoming server operations, and applied to the editor model.

Run tests:
```bash
npm run test
```

## CI/CD (GitHub Actions)

Every pull request triggers a workflow that runs both test suites. A >80% code coverage threshold is enforced, along with 0 linting errors, before any merge is permitted.
