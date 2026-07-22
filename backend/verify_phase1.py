"""End-to-end verification script and quality gate validation for Phase 1."""

from pathlib import Path
import subprocess
import sys

from sqlalchemy import inspect
from sqlalchemy.orm import Session

# Ensure backend directory is in sys.path for direct script execution
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.database import Base, engine  # noqa: E402
from app.models import Document, Operation, User  # noqa: E402


def verify_tables() -> None:
    """Create and inspect database tables."""
    print("Creating database tables...")
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"Discovered tables in database: {tables}")

    assert "users" in tables, "Table 'users' missing from database"
    assert "documents" in tables, "Table 'documents' missing from database"
    assert "operations" in tables, "Table 'operations' missing from database"
    print("Table existence verification PASSED.")


def verify_crud() -> None:
    """Perform end-to-end CRUD verification for User, Document, and Operation."""
    print("Starting end-to-end CRUD verification...")
    with Session(engine) as session:
        # Create User
        test_user = User(
            google_id="google_verify_123",
            email="verifier@syncdocs.test",
            name="Phase1 Verifier",
        )
        session.add(test_user)
        session.commit()
        session.refresh(test_user)

        user_id = test_user.id
        assert user_id is not None, "User ID not generated"
        print(f"Created User: id={user_id}, name={test_user.name}")

        # Create Document owned by User
        test_doc = Document(
            title="Phase 1 Verification Doc",
            content="Verification initial content",
            owner_id=user_id,
        )
        session.add(test_doc)
        session.commit()
        session.refresh(test_doc)

        doc_id = test_doc.id
        assert doc_id is not None, "Document ID not generated"
        assert test_doc.owner_id == user_id, "Document owner_id mismatch"
        print(f"Created Document: id={doc_id}, title={test_doc.title}")

        # Create Operation on Document by User
        op_data = {"op": "insert", "pos": 0, "str": "Hello "}
        test_op = Operation(
            document_id=doc_id,
            revision=1,
            user_id=user_id,
            operation_data=op_data,
        )
        session.add(test_op)
        session.commit()
        session.refresh(test_op)

        op_id = test_op.id
        assert op_id is not None, "Operation ID not generated"
        assert test_op.document_id == doc_id, "Operation document_id mismatch"
        assert test_op.user_id == user_id, "Operation user_id mismatch"
        print(f"Created Operation: id={op_id}, revision={test_op.revision}")

        # Query back and verify fields and relationships
        queried_user = session.query(User).filter_by(id=user_id).one()
        assert queried_user.email == "verifier@syncdocs.test"
        assert queried_user.google_id == "google_verify_123"
        assert len(queried_user.documents) == 1
        assert queried_user.documents[0].id == doc_id
        assert len(queried_user.operations) == 1
        assert queried_user.operations[0].id == op_id
        print("User model fields and relationships PASSED.")

        queried_doc = session.query(Document).filter_by(id=doc_id).one()
        assert queried_doc.title == "Phase 1 Verification Doc"
        assert queried_doc.content == "Verification initial content"
        assert queried_doc.current_revision == 0
        assert queried_doc.owner.id == user_id
        assert len(queried_doc.operations) == 1
        assert queried_doc.operations[0].id == op_id
        print("Document model fields and relationships PASSED.")

        queried_op = session.query(Operation).filter_by(id=op_id).one()
        assert queried_op.revision == 1
        assert queried_op.operation_data == op_data
        assert queried_op.document.id == doc_id
        assert queried_op.user.id == user_id
        print("Operation model fields and relationships PASSED.")

        # Clean up created records
        session.delete(test_op)
        session.delete(test_doc)
        session.delete(test_user)
        session.commit()
        print("Cleaned up CRUD verification data.")

    print("End-to-end CRUD verification PASSED.")


def run_pytest() -> None:
    """Run pytest programmatically or via sub-process on backend/tests/."""
    print("Running pytest on backend tests...")
    tests_dir = backend_dir / "tests"
    cmd = [sys.executable, "-m", "pytest", str(tests_dir)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    print("Pytest stdout:")
    print(result.stdout)
    if result.stderr:
        print("Pytest stderr:")
        print(result.stderr)
    assert result.returncode == 0, f"Pytest failed with code {result.returncode}"
    print("Pytest verification PASSED.")


def main() -> None:
    """Execute all Phase 1 verifications."""
    print("=== STARTING PHASE 1 VERIFICATION ===")
    verify_tables()
    verify_crud()
    run_pytest()
    print("=== PHASE 1 VERIFICATION SUCCESSFUL ===")


if __name__ == "__main__":
    main()
