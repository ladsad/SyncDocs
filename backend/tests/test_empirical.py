"""Empirical challenge stress tests for SyncDocs Milestone 2 DB Schema."""

import os
import tempfile
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from app.database import Base, set_sqlite_pragma
from app.models import Document, Operation, User


@pytest.fixture
def memory_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    from sqlalchemy import event

    event.listen(engine, "connect", set_sqlite_pragma)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session, engine
    session.close()
    engine.dispose()


# -------------------------------------------------------------------
# 1. Datetime Timezone Awareness Verification
# -------------------------------------------------------------------


def test_datetime_timezone_awareness_loss(memory_db):
    session, engine = memory_db
    user = User(google_id="g_tz", email="tz@test.com", name="TZ User")
    session.add(user)
    session.commit()
    session.refresh(user)

    # Observation: Custom UTCDateTime ensures tzinfo is timezone.utc
    assert user.created_at.tzinfo == timezone.utc

    # Comparison with timezone-aware datetime succeeds without TypeError
    now_utc = datetime.now(timezone.utc)
    assert user.created_at <= now_utc


def test_document_updated_at_onupdate(memory_db):
    session, engine = memory_db
    user = User(google_id="g_upd", email="upd@test.com", name="Upd User")
    session.add(user)
    session.commit()

    doc = Document(title="Doc 1", owner_id=user.id)
    session.add(doc)
    session.commit()
    session.refresh(doc)
    t1 = doc.updated_at

    doc.title = "Updated Doc 1 Title"
    session.commit()
    session.refresh(doc)
    session.refresh(doc)
    t2 = doc.updated_at

    assert t2 >= t1
    assert t2.tzinfo == timezone.utc


# -------------------------------------------------------------------
# 2. UUID Type Handling Verification
# -------------------------------------------------------------------


def test_uuid_type_retrieval_and_string_binding_failure(memory_db):
    session, engine = memory_db
    u_id = uuid.uuid4()
    user = User(id=u_id, google_id="g_uuid", email="uuid@test.com", name="UUID User")
    session.add(user)
    session.commit()
    session.refresh(user)

    # Retained python object is uuid.UUID
    assert isinstance(user.id, uuid.UUID)

    # Querying with string representation of UUID succeeds with custom GUID type
    fetched = session.query(User).filter(User.id == str(u_id)).first()
    assert fetched is not None
    assert fetched.id == u_id

    # Instantiating model with string UUID succeeds on commit
    doc_str_uuid = Document(
        id=str(uuid.uuid4()), title="String UUID Doc", owner_id=str(u_id)
    )
    session.add(doc_str_uuid)
    session.commit()
    assert isinstance(doc_str_uuid.id, uuid.UUID)


def test_uuid_raw_storage_format(memory_db):
    session, engine = memory_db
    u_id = uuid.uuid4()
    user = User(id=u_id, google_id="g_raw", email="raw@test.com", name="Raw User")
    session.add(user)
    session.commit()

    with engine.connect() as conn:
        raw_id = conn.execute(
            text("SELECT id FROM users WHERE google_id='g_raw'")
        ).scalar()
        # In SQLite, custom GUID type stores 36-char string with hyphens
        assert raw_id == str(u_id)
        assert len(raw_id) == 36


# -------------------------------------------------------------------
# 3. SQLite Connection & Pragma Verification
# -------------------------------------------------------------------


def test_sqlite_foreign_key_pragma_enabled(memory_db):
    session, engine = memory_db
    # FK violation raises IntegrityError
    invalid_doc = Document(title="Orphan", owner_id=uuid.uuid4())
    session.add(invalid_doc)
    with pytest.raises(IntegrityError):
        session.commit()


def test_sqlite_wal_mode_disabled():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        db_path = tmp.name
    try:
        test_engine = create_engine(
            f"sqlite:///{db_path}", connect_args={"check_same_thread": False}
        )
        from sqlalchemy import event

        event.listen(test_engine, "connect", set_sqlite_pragma)

        with test_engine.connect() as conn:
            journal_mode = conn.execute(text("PRAGMA journal_mode")).scalar()
            # PRAGMA journal_mode is now WAL mode
            assert journal_mode.lower() == "wal"
        test_engine.dispose()
    finally:
        if os.path.exists(db_path):
            try:
                os.unlink(db_path)
            except PermissionError:
                pass


# -------------------------------------------------------------------
# 4. Schema Constraints & Edge Cases Verification
# -------------------------------------------------------------------


def test_operation_user_id_set_null_on_user_delete(memory_db):
    session, engine = memory_db
    u_owner = User(google_id="g_owner", email="owner@test.com", name="Owner")
    u_editor = User(google_id="g_editor", email="editor@test.com", name="Editor")
    session.add_all([u_owner, u_editor])
    session.commit()

    doc = Document(title="Doc FK Test", owner_id=u_owner.id)
    session.add(doc)
    session.commit()

    op = Operation(
        document_id=doc.id,
        revision=1,
        user_id=u_editor.id,
        operation_data={"op": "insert"},
    )
    session.add(op)
    session.commit()
    op_id = op.id

    # Delete the editor user
    session.delete(u_editor)
    session.commit()

    # Operation should still exist, but user_id should be SET NULL
    op_refreshed = session.query(Operation).filter_by(id=op_id).first()
    assert op_refreshed is not None
    assert op_refreshed.user_id is None


def test_null_google_drive_file_id_multiplicity(memory_db):
    session, engine = memory_db
    u = User(google_id="g_multi", email="multi@test.com", name="Multi")
    session.add(u)
    session.commit()

    doc1 = Document(title="Doc 1", owner_id=u.id, google_drive_file_id=None)
    doc2 = Document(title="Doc 2", owner_id=u.id, google_drive_file_id=None)
    session.add_all([doc1, doc2])
    session.commit()

    assert doc1.id is not None
    assert doc2.id is not None
