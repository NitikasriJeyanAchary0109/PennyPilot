from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Import settings and Base metadata
from app.config import settings
from app.database import Base
from app.models.models import User, UserSession, SecurityEvent, Goal, Savings, Notification, ChatHistory, FinancialHealth, Transaction, Budget, AIRecommendation, AuditLog

config = context.config

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Ensure database URL matches config.py settings
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

target_metadata = Base.metadata

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()

from alembic import op

if not hasattr(op, "rename_column"):
    def _rename_column(table_name, old_column_name, new_column_name, **kw):
        return op.alter_column(table_name, old_column_name, new_column_name=new_column_name, **kw)
    setattr(op, "rename_column", _rename_column)

_orig_create_foreign_key = op.create_foreign_key
def _safe_create_foreign_key(*args, **kwargs):
    bind = op.get_bind()
    if bind and bind.dialect.name == "sqlite":
        return None
    return _orig_create_foreign_key(*args, **kwargs)
setattr(op, "create_foreign_key", _safe_create_foreign_key)

_orig_drop_constraint = op.drop_constraint
def _safe_drop_constraint(*args, **kwargs):
    bind = op.get_bind()
    if bind and bind.dialect.name == "sqlite":
        return None
    return _orig_drop_constraint(*args, **kwargs)
setattr(op, "drop_constraint", _safe_drop_constraint)

_orig_alter_column = op.alter_column
def _safe_alter_column(table_name, column_name, **kw):
    bind = op.get_bind()
    if bind and bind.dialect.name == "sqlite":
        with op.batch_alter_table(table_name) as batch_op:
            return batch_op.alter_column(column_name, **kw)
    return _orig_alter_column(table_name, column_name, **kw)
setattr(op, "alter_column", _safe_alter_column)

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        if connection.dialect.name == "sqlite":
            from datetime import datetime
            raw_conn = getattr(connection, "connection", None)
            dbapi_conn = getattr(raw_conn, "dbapi_connection", raw_conn)
            if hasattr(dbapi_conn, "create_function"):
                dbapi_conn.create_function("now", 0, lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))
                dbapi_conn.create_function("NOW", 0, lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"))

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=(connection.dialect.name == "sqlite"),
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
