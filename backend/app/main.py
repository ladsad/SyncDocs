"""Main application module for SyncDocs FastAPI backend."""

from fastapi import FastAPI

app = FastAPI(title="SyncDocs API")


@app.get("/")
def read_root():
    """Health check root endpoint."""
    return {"status": "ok", "message": "SyncDocs API is running"}
