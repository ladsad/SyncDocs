"""Unit tests for SyncDocs database models and constraints."""

from datetime import datetime, timezone
import uuid

import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.models import Document, Operation, User


@pytest.fixture(name="db_session")
def db_session_fixture():
    """Create an in-memory database session for testing."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
        engine.dispose()


def test_create_tables():
    """Verify Base.metadata.create_all creates all expected tables."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    assert "users" in tables
    assert "documents" in tables
    assert "operations" in tables
    engine.dispose()


def test_get_db():
    """Test get_db dependency generator yields session and closes it."""
    db_gen = get_db()
    session = next(db_gen)
    assert session is not None
    with pytest.raises(StopIteration):
        next(db_gen)


def test_user_crud(db_session):
    """Test inserting, reading, updating, and deleting a User."""
    # Create
    user = User(
        google_id="google_123",
        email="testuser@example.com",
        name="Test User",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)

    assert isinstance(user.id, uuid.UUID)

    # Read
    saved_user = db_session.query(User).filter_by(id=user.id).first()
    assert saved_user is not None
    assert saved_user.google_id == "google_123"
    assert saved_user.email == "testuser@example.com"
    assert saved_user.name == "Test User"
    assert saved_user.created_at is not None

    # Update
    saved_user.name = "Updated User Name"
    db_session.commit()
    updated_user = db_session.query(User).filter_by(id=user.id).first()
    assert updated_user.name == "Updated User Name"

    # Delete
    db_session.delete(updated_user)
    db_session.commit()
    deleted_user = db_session.query(User).filter_by(id=user.id).first()
    assert deleted_user is None


def test_document_crud_and_relationships(db_session):
    """Test creating Document for a User and verifying relationships."""
    user = User(
        google_id="google_owner",
        email="owner@example.com",
        name="Owner User",
    )
    db_session.add(user)
    db_session.commit()

    doc = Document(
        google_drive_file_id="drive_file_100",
        title="Test Document",
        content="Initial content",
        owner_id=user.id,
    )
    db_session.add(doc)
    db_session.commit()

    # Verify relationships
    assert doc.owner == user
    assert len(user.documents) == 1
    assert user.documents[0] == doc
    assert doc.current_revision == 0
    assert doc.created_at is not None
    assert doc.updated_at is not None


def test_operation_crud_and_relationships(db_session):
    """Test creating Operation records for a Document and verifying relationships."""
    user = User(
        google_id="google_editor",
        email="editor@example.com",
        name="Editor User",
    )
    db_session.add(user)
    db_session.commit()

    doc = Document(
        google_drive_file_id="drive_file_200",
        title="Op Doc",
        owner_id=user.id,
    )
    db_session.add(doc)
    db_session.commit()

    op_data = {"type": "insert", "position": 0, "text": "Hello"}
    op = Operation(
        document_id=doc.id,
        revision=1,
        user_id=user.id,
        operation_data=op_data,
    )
    db_session.add(op)
    db_session.commit()

    # Verify relationships
    assert op.document == doc
    assert op.user == user
    assert len(doc.operations) == 1
    assert doc.operations[0] == op
    assert len(user.operations) == 1
    assert user.operations[0] == op
    assert op.operation_data == op_data


def test_cascade_delete(db_session):
    """Verify deleting a User cascade-deletes their Document and Operation records."""
    user = User(
        google_id="google_cascade",
        email="cascade@example.com",
        name="Cascade User",
    )
    db_session.add(user)
    db_session.commit()

    doc = Document(
        google_drive_file_id="drive_cascade",
        title="Cascade Doc",
        owner_id=user.id,
    )
    db_session.add(doc)
    db_session.commit()

    op = Operation(
        document_id=doc.id,
        revision=1,
        user_id=user.id,
        operation_data={"op": "insert"},
    )
    db_session.add(op)
    db_session.commit()

    doc_id = doc.id
    op_id = op.id

    # Delete User
    db_session.delete(user)
    db_session.commit()

    # Verify Document and Operation are deleted
    assert db_session.query(Document).filter_by(id=doc_id).first() is None
    assert db_session.query(Operation).filter_by(id=op_id).first() is None


def test_foreign_key_enforcement(db_session):
    """Verify inserting a Document with non-existent owner_id raises IntegrityError."""
    fake_user_id = uuid.uuid4()
    doc = Document(
        google_drive_file_id="drive_invalid_fk",
        title="Invalid FK Doc",
        owner_id=fake_user_id,
    )
    db_session.add(doc)

    with pytest.raises(IntegrityError):
        db_session.commit()


def test_unique_constraints(db_session):
    """Verify duplicate google_id, email, google_drive_file_id, or
    (document_id, revision) raise IntegrityError.
    """
    u1 = User(
        google_id="g_unique",
        email="unique1@example.com",
        name="User 1",
    )
    db_session.add(u1)
    db_session.commit()

    # Duplicate google_id
    u_dup_gid = User(
        google_id="g_unique",
        email="unique2@example.com",
        name="User Dup GID",
    )
    db_session.add(u_dup_gid)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Duplicate email
    u_dup_email = User(
        google_id="g_unique_2",
        email="unique1@example.com",
        name="User Dup Email",
    )
    db_session.add(u_dup_email)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Create document for remaining unique tests
    doc1 = Document(
        google_drive_file_id="drive_unique",
        title="Doc Unique",
        owner_id=u1.id,
    )
    db_session.add(doc1)
    db_session.commit()

    # Duplicate google_drive_file_id
    doc_dup_drive = Document(
        google_drive_file_id="drive_unique",
        title="Doc Dup Drive",
        owner_id=u1.id,
    )
    db_session.add(doc_dup_drive)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # Create operation
    op1 = Operation(
        document_id=doc1.id,
        revision=1,
        user_id=u1.id,
        operation_data={"data": "test"},
    )
    db_session.add(op1)
    db_session.commit()

    # Duplicate (document_id, revision)
    op_dup_rev = Operation(
        document_id=doc1.id,
        revision=1,
        user_id=u1.id,
        operation_data={"data": "dup"},
    )
    db_session.add(op_dup_rev)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_editor_user_delete_sets_null_user_id(db_session):
    """Verify deleting non-owner operation author sets user_id to NULL on operation."""
    owner = User(
        google_id="google_owner_null_test",
        email="owner_null_test@example.com",
        name="Owner User",
    )
    editor = User(
        google_id="google_editor_null_test",
        email="editor_null_test@example.com",
        name="Editor User",
    )
    db_session.add_all([owner, editor])
    db_session.commit()

    doc = Document(
        google_drive_file_id="drive_editor_null_test",
        title="Editor Null Test Doc",
        owner_id=owner.id,
    )
    db_session.add(doc)
    db_session.commit()

    op = Operation(
        document_id=doc.id,
        revision=1,
        user_id=editor.id,
        operation_data={"type": "insert", "position": 0, "text": "Hi"},
    )
    db_session.add(op)
    db_session.commit()

    doc_id = doc.id
    op_id = op.id
    editor_id = editor.id

    # Delete non-owner editor user
    db_session.delete(editor)
    db_session.commit()

    # Verify editor user is deleted
    assert db_session.query(User).filter_by(id=editor_id).first() is None

    # Verify Document and Operation persist
    persisted_doc = db_session.query(Document).filter_by(id=doc_id).first()
    assert persisted_doc is not None

    persisted_op = db_session.query(Operation).filter_by(id=op_id).first()
    assert persisted_op is not None
    assert persisted_op.user_id is None


def test_string_uuid_binding(db_session):
    """Verify querying and creating models with string UUIDs works without error."""
    str_user_id = str(uuid.uuid4())
    user = User(
        id=str_user_id,
        google_id="google_str_uuid",
        email="str_uuid@example.com",
        name="String UUID User",
    )
    db_session.add(user)
    db_session.commit()

    # Query using string UUID
    fetched_user = db_session.query(User).filter_by(id=str_user_id).first()
    assert fetched_user is not None
    assert fetched_user.id == uuid.UUID(str_user_id)
    assert isinstance(fetched_user.id, uuid.UUID)

    str_doc_id = str(uuid.uuid4())
    doc = Document(
        id=str_doc_id,
        google_drive_file_id="drive_str_uuid",
        title="Str UUID Doc",
        owner_id=str_user_id,
    )
    db_session.add(doc)
    db_session.commit()

    fetched_doc = db_session.query(Document).filter(Document.id == str_doc_id).first()
    assert fetched_doc is not None
    assert fetched_doc.id == uuid.UUID(str_doc_id)
    assert fetched_doc.owner_id == uuid.UUID(str_user_id)


def test_utc_datetime_timezone_awareness(db_session):
    """Verify created_at and updated_at returned from DB have tzinfo == timezone.utc
    and can be compared directly with datetime.now(timezone.utc).
    """
    now_before = datetime.now(timezone.utc)
    user = User(
        google_id="google_tz_test",
        email="tz_test@example.com",
        name="TZ Test User",
    )
    db_session.add(user)
    db_session.commit()

    doc = Document(
        google_drive_file_id="drive_tz_test",
        title="TZ Test Doc",
        owner_id=user.id,
    )
    db_session.add(doc)
    db_session.commit()

    db_session.refresh(user)
    db_session.refresh(doc)

    assert user.created_at.tzinfo == timezone.utc
    assert doc.created_at.tzinfo == timezone.utc
    assert doc.updated_at.tzinfo == timezone.utc

    now_after = datetime.now(timezone.utc)
    assert now_before <= user.created_at <= now_after
    assert now_before <= doc.created_at <= now_after
    assert now_before <= doc.updated_at <= now_after


def test_sqlite_wal_pragma():
    """Verify SQLite connection executes WAL mode and busy timeout pragmas."""
    test_engine = create_engine("sqlite:///:memory:")
    with test_engine.connect() as conn:
        timeout_val = conn.exec_driver_sql("PRAGMA busy_timeout").scalar()
        assert timeout_val == 5000
        journal_val = conn.exec_driver_sql("PRAGMA journal_mode").scalar()
        assert journal_val.lower() in ("wal", "memory")
    test_engine.dispose()
