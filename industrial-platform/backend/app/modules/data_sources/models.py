import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class DataSource(CreatedAt, Base):
    __tablename__ = "data_sources"
    __table_args__ = (UniqueConstraint("project_id", "name"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    name: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    kind: Mapped[str] = mapped_column(Text, comment="simulated | manual | scada_http_ws | http_json")
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, comment="never contains secrets")
    status: Mapped[str] = mapped_column(Text, default="unknown")
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    lock_version: Mapped[int] = mapped_column(Integer, default=1)
