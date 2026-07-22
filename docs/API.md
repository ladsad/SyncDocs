# API Specification

## REST API (Authentication & Metadata)

### `POST /auth/google`
Exchanges a Google OAuth token for an internal application session token.

### `GET /api/documents`
Lists documents available to the authenticated user.

### `POST /api/documents`
Creates a new document.

### `GET /api/documents/{doc_id}`
Retrieves document metadata and the initial content state (including the `current_revision`).

## WebSocket Protocol (Real-Time Synchronization)

Connection: `ws://<domain>/ws/documents/{doc_id}`

### Client-to-Server Messages

**Join Document**
```json
{
  "type": "join",
  "user_id": "uuid",
  "revision": 10
}
```

**Submit Operation**
```json
{
  "type": "operation",
  "revision": 10,
  "op": [
    {"retain": 5},
    {"insert": "hello"},
    {"delete": 2}
  ]
}
```

### Server-to-Client Messages

**Initial State**
```json
{
  "type": "init",
  "clients": ["user1", "user2"]
}
```

**Acknowledge Operation**
```json
{
  "type": "ack",
  "revision": 11
}
```

**Broadcast Operation**
```json
{
  "type": "operation",
  "user_id": "uuid",
  "revision": 11,
  "op": [
    {"retain": 5},
    {"insert": "hello"},
    {"delete": 2}
  ]
}
```
