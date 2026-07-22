# Contributing to SyncDocs

## Dev Setup

```bash
git clone <repo_url>
cd SyncDocs

# Backend
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
pytest

# Frontend
cd ../frontend
npm install
npm test
```

## Before Opening a PR

- [ ] Backend tests pass (`pytest`)
- [ ] Frontend tests pass (`npm test`)
- [ ] Linting passes (`flake8`, `black`, `eslint`, `prettier`)
- [ ] `CHANGELOG.md` is updated with relevant entries
- [ ] Any API changes are reflected in `docs/API.md`

## Code Style

- **Python**: Enforced via `black` and `flake8`.
- **JavaScript/TypeScript**: Enforced via `eslint` and `prettier`.
- Prefer explicit error handling and comprehensive docstrings for OT algorithms.

## Commit Messages

Conventional-commit style preferred: `feat(api): add document creation endpoint`, `fix(ot): resolve concurrent insert conflict`, `test(frontend): add editor component tests`.
