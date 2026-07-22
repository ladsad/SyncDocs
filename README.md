<div align="center">
  <h1>📝 SyncDocs</h1>
  <p><b>A real-time collaborative document editor powered by Operational Transformation.</b></p>
</div>

---

SyncDocs is an engineered solution for real-time collaborative document editing. It leverages a modern stack (FastAPI, WebSockets, React) and deeply integrates with Google Workspace APIs for seamless authentication and file management.

## ✨ Features

- **Real-Time Collaboration**: Sub-100ms latency editing via WebSockets.
- **Operational Transformation (OT)**: Ensures 100% data consistency during high-frequency concurrent edits.
- **Google Workspace Integration**: Unified authentication and secure file management using Google's ecosystem.
- **Robust Quality**: Comprehensive CI/CD pipeline with automated PyTest and Jest testing.

## 🏗️ Architecture at a Glance

Client requests route through a React frontend to a FastAPI backend. Authentication is handled via REST, while document editing occurs over WebSockets. Concurrent edits are resolved using Operational Transformation before being persisted to a PostgreSQL database.

*(For a full architectural breakdown, see [`docs/technical_design_document.md`](docs/technical_design_document.md))*

## 🚀 Quick Start

### 1. Setup Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### 2. Setup Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 📚 Documentation Index

| Document | Contents |
|---|---|
| [**`technical_design_document.md`**](docs/technical_design_document.md) | Full architectural design doc (goals, OT algorithms, schemas). |
| [**`ROADMAP.md`**](docs/ROADMAP.md) | The chronological development phases of SyncDocs. |
| [**`API.md`**](docs/API.md) | REST and WebSocket protocol specifications. |
| [**`TESTING.md`**](docs/TESTING.md) | Testing strategy across backend and frontend layers. |
| [**`CONTRIBUTING.md`**](CONTRIBUTING.md) | Developer setup and contribution guidelines. |
| [**`CHANGELOG.md`**](CHANGELOG.md) | Detailed release notes. |

## 📄 License
Distributed under the MIT License.
