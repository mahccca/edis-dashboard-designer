import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, Text, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class MediaAsset(CreatedAt, Base):
    __tablename__ = "media_assets"
    __table_args__ = (UniqueConstraint("project_id", "sha256", name="uq_media_assets_project_sha256"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    kind: Mapped[str] = mapped_column(Text)  # svg | …
    content_type: Mapped[str] = mapped_column(Text)
    filename: Mapped[str | None] = mapped_column(Text)
    sha256: Mapped[bytes] = mapped_column(LargeBinary(32))
    byte_size: Mapped[int] = mapped_column(Integer)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
