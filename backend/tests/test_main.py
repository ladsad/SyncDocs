"""Tests for main FastAPI application endpoints."""

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_read_root():
    """Test health check root endpoint returns 200 and expected payload."""
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "SyncDocs API is running"}
