"""Unit tests for SyncDocs database models and constraints."""

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
    """Verify duplicate google_id, email, google_drive_file_id, or (document_id, revision) raise IntegrityError."""
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
