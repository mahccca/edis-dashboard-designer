import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint, Uuid, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, uuid7


class ApiResponseSample(Base):
    __tablename__ = "api_response_samples"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    data_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_sources.id", ondelete="CASCADE"))
    query_key: Mapped[str] = mapped_column(Text)
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    status_code: Mapped[int | None] = mapped_column(Integer)
    headers: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    body: Mapped[Any | None] = mapped_column(JSONB)
    byte_size: Mapped[int] = mapped_column(Integer, default=0)
    ok: Mapped[bool] = mapped_column(Boolean, default=False)
    message: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)


class ApiSchema(Base):
    __tablename__ = "api_schemas"
    __table_args__ = (UniqueConstraint("data_source_id", "query_key", "version"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    data_source_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("data_sources.id", ondelete="CASCADE"))
    query_key: Mapped[str] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer)
    schema: Mapped[dict[str, Any]] = mapped_column(JSONB)
    inferred_from_sample_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("api_response_samples.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
