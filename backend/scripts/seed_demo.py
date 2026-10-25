"""
Create the local demo student (see app/services/demo_seed.py for the login).

    cd backend && python scripts/seed_demo.py            # create / top up
    cd backend && python scripts/seed_demo.py --reset    # wipe the demo student first

Uses the database configured in .env (the same one the dev server uses).
"""

import os
import sys

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BACKEND_DIR)
os.chdir(BACKEND_DIR)

import app.models.models  # noqa: E402,F401
from app.config import settings  # noqa: E402
from app.database import Base, engine, upgrade_sqlite_schema  # noqa: E402
from app.main import app  # noqa: E402
from app.services.demo_seed import DEMO_EMAIL, DEMO_PASSWORD, seed  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


def reset_demo_user() -> None:
    """Delete only the demo student (all of its data cascades)."""
    from app.database import SessionLocal
    from app.models.models import User

    with SessionLocal() as db:
        user = db.query(User).filter(User.email == DEMO_EMAIL).first()
        if user:
            db.delete(user)
            db.commit()
            print("Removed the existing demo student.")


def main() -> None:
    if settings.ENVIRONMENT.lower() == "production":
        sys.exit("Refusing to create a demo account in production.")

    Base.metadata.create_all(bind=engine)
    upgrade_sqlite_schema(engine)
    if "--reset" in sys.argv:
        reset_demo_user()
    with TestClient(app) as client:
        result = seed(client)

    print(
        f"Demo student ready: {result['imported']} transactions imported as history "
        f"({result['duplicates_skipped']} already present), "
        f"{result['simulated']} simulated payments."
    )
    print(f"  email:    {DEMO_EMAIL}")
    print(f"  password: {DEMO_PASSWORD}")


if __name__ == "__main__":
    main()
