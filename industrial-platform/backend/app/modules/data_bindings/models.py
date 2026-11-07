import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, Text, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class DataBinding(CreatedAt, Base):
    __tablename__ = "data_bindings"
    __table_args__ = (
        CheckConstraint(
            "(source_kind = 'object_variable' AND object_id IS NOT NULL AND variable_key IS NOT NULL)"
            " OR (source_kind <> 'object_variable' AND object_id IS NULL)",
            name="source_columns",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(Text)
    source_kind: Mapped[str] = mapped_column(Text)
    object_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("industrial_objects.id", ondelete="RESTRICT"), index=True)
    variable_key: Mapped[str | None] = mapped_column(Text)
    spec: Mapped[dict[str, Any]] = mapped_column(JSONB)
    lock_version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
