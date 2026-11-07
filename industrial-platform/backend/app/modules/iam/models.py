import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, LargeBinary, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, CreatedAt, uuid7


class User(CreatedAt, Base):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    username: Mapped[str] = mapped_column(Text, unique=True, comment="stored lower-case")
    password_hash: Mapped[str] = mapped_column(Text)
    display_name: Mapped[str] = mapped_column(Text)
    locale: Mapped[str | None] = mapped_column(Text)
    is_platform_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(Text, default="active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Role(Base):
    __tablename__ = "roles"
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)


class Permission(Base):
    __tablename__ = "permissions"
    key: Mapped[str] = mapped_column(Text, primary_key=True)
    description: Mapped[str] = mapped_column(Text, default="")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    role_key: Mapped[str] = mapped_column(ForeignKey("roles.key", ondelete="CASCADE"), primary_key=True)
    permission_key: Mapped[str] = mapped_column(ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True)


class ProjectMember(CreatedAt, Base):
    __tablename__ = "project_members"
    project_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True)
    role_key: Mapped[str] = mapped_column(ForeignKey("roles.key"))


class AuthSession(CreatedAt, Base):
    __tablename__ = "sessions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid7)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[bytes] = mapped_column(LargeBinary, unique=True)
    csrf_token: Mapped[str] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ip: Mapped[str | None] = mapped_column(Text)
    user_agent: Mapped[str | None] = mapped_column(Text)
