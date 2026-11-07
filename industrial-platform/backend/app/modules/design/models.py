import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, LargeBinary, Text, UniqueConstraint, Uuid, func, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class Document(CreatedAt, Base):
    """Supertype of page / template / template_part / dashboard documents."""

    __tablename__ = "documents"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"), index=True)
    document_type: Mapped[str] = mapped_column(Text)
    name: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, default="draft")
    head_revision_no: Mapped[int] = mapped_column(Integer)
    live_published_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("published_versions.id", use_alter=True, name="fk_documents_live_published_version")
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Page(Base):
    __tablename__ = "pages"
    __table_args__ = (
        Index("uq_pages_project_id_path", "project_id", "path", unique=True, postgresql_where=text("archived_at IS NULL")),
        Index("uq_pages_project_id_slug", "project_id", "slug", unique=True, postgresql_where=text("archived_at IS NULL")),
    )
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id"))
    kind: Mapped[str] = mapped_column(Text, default="page")
    title: Mapped[Any] = mapped_column(JSONB)
    slug: Mapped[str] = mapped_column(Text)
    path: Mapped[str] = mapped_column(Text)
    header_policy: Mapped[dict[str, Any]] = mapped_column(JSONB, default=lambda: {"mode": "auto"})
    seo: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class DocumentRevision(CreatedAt, Base):
    """Append-only (enforced by trigger)."""

    __tablename__ = "document_revisions"
    __table_args__ = (UniqueConstraint("document_id", "revision_no"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"))
    revision_no: Mapped[int] = mapped_column(Integer)
    schema_version: Mapped[int] = mapped_column(Integer)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    content_hash: Mapped[bytes] = mapped_column(LargeBinary)
    message: Mapped[str | None] = mapped_column(Text)
    autosave: Mapped[bool] = mapped_column(Boolean, default=False)
    restored_from_no: Mapped[int | None] = mapped_column(Integer)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))


class PublishedVersion(Base):
    """Immutable (enforced by trigger). Liveness lives in documents.live_published_version_id."""

    __tablename__ = "published_versions"
    __table_args__ = (UniqueConstraint("document_id", "version_no"),)
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id"))
    version_no: Mapped[int] = mapped_column(Integer)
    source_revision_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("document_revisions.id", ondelete="RESTRICT"))
    bundle: Mapped[dict[str, Any]] = mapped_column(JSONB)
    bundle_hash: Mapped[bytes] = mapped_column(LargeBinary)
    bundle_schema_version: Mapped[int] = mapped_column(Integer, default=1)
    note: Mapped[str | None] = mapped_column(Text)
    published_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PublishedVersionPin(Base):
    __tablename__ = "published_version_pins"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    published_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("published_versions.id", ondelete="RESTRICT"), index=True)
    component_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("component_versions.id", ondelete="RESTRICT"), index=True)


class ComponentUsage(Base):
    """Derived index of component nodes in each document's head revision (rebuilt on save)."""

    __tablename__ = "component_usages"
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), primary_key=True)
    node_id: Mapped[str] = mapped_column(Text, primary_key=True)
    component_version_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("component_versions.id"), index=True)
    revision_no: Mapped[int] = mapped_column(Integer)
