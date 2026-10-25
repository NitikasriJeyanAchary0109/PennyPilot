from app.config import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# ==========================
# Database Engine
# ==========================
connect_args = (
    {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}
)
engine = create_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
    connect_args=connect_args,
)

# ==========================
# Session Factory
# ==========================
SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)

# ==========================
# Base Model
# ==========================
Base = declarative_base()


# ==========================
# Dependency
# ==========================
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def upgrade_sqlite_schema(bind=None) -> list:
    """
    Add columns that models gained since a development SQLite file was created.

    `create_all` only creates *missing tables*; it never alters existing ones, so
    an older `pennypilot.db` would fail with "no such column" after an update.
    SQLite dev databases are not managed by Alembic (see migrations 007/008), so
    this adds the missing columns in place, keeping the data. NOT NULL columns get
    their server default; UNIQUE columns get a unique index (SQLite cannot add a
    UNIQUE column with ALTER TABLE). Returns the "table.column" names added.
    """
    from sqlalchemy import inspect, text

    bind = bind or engine
    if bind.dialect.name != "sqlite":
        return []

    added = []
    inspector = inspect(bind)
    existing_tables = set(inspector.get_table_names())
    with bind.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {c["name"] for c in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                ddl = (
                    f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" '
                    f"{column.type.compile(bind.dialect)}"
                )
                if column.server_default is not None and not column.nullable:
                    default = column.server_default.arg
                    ddl += f" NOT NULL DEFAULT '{default}'"
                connection.execute(text(ddl))
                if column.unique:
                    connection.execute(
                        text(
                            f"CREATE UNIQUE INDEX IF NOT EXISTS "
                            f'"uq_{table.name}_{column.name}" '
                            f'ON "{table.name}" ("{column.name}")'
                        )
                    )
                added.append(f"{table.name}.{column.name}")
    return added
