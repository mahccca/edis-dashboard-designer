import hashlib
import hmac
import secrets
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import utcnow
from app.core.errors import ApiError, forbidden, not_found
from app.modules.iam.models import AuthSession, ProjectMember, RolePermission, User

_hasher = PasswordHasher()
# Computed once so unknown usernames cost the same as wrong passwords.
_DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(16))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        _hasher.verify(password_hash, password)
        return True
    except (VerificationError, InvalidHashError):
        return False


def _token_hash(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()


class LoginLimiter:
    """In-process failure counter per (username, ip). Adequate for the single-instance v1 deployment."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._failures: dict[str, list[float]] = {}

    def _key(self, username: str, ip: str | None) -> str:
        return f"{username.lower()}|{ip}"

    def check(self, username: str, ip: str | None) -> None:
        s = get_settings()
        now = time.monotonic()
        with self._lock:
            recent = [t for t in self._failures.get(self._key(username, ip), []) if now - t < s.login_failure_window_seconds]
            self._failures[self._key(username, ip)] = recent
            if len(recent) >= s.login_max_failures:
                raise ApiError(429, "too_many_attempts", "Too many failed login attempts",
                               retryAfterSeconds=s.login_failure_window_seconds)

    def fail(self, username: str, ip: str | None) -> None:
        with self._lock:
            self._failures.setdefault(self._key(username, ip), []).append(time.monotonic())

    def reset(self, username: str, ip: str | None) -> None:
        with self._lock:
            self._failures.pop(self._key(username, ip), None)


login_limiter = LoginLimiter()


def create_user(db: Session, username: str, password: str, display_name: str, is_platform_admin: bool = False) -> User:
    user = User(username=username.lower(), password_hash=hash_password(password),
                display_name=display_name, is_platform_admin=is_platform_admin)
    db.add(user)
    db.flush()
    return user


def set_password(db: Session, user: User, password: str) -> None:
    user.password_hash = hash_password(password)


def by_username(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(User.username == username.lower()))


def role_permissions(db: Session) -> dict[str, list[str]]:
    grants: dict[str, list[str]] = {}
    for role_key, perm in db.execute(select(RolePermission.role_key, RolePermission.permission_key)):
        grants.setdefault(role_key, []).append(perm)
    return grants


def authenticate(db: Session, username: str, password: str, ip: str | None) -> User:
    login_limiter.check(username, ip)
    user = db.scalar(select(User).where(User.username == username.lower()))
    try:
        _hasher.verify(user.password_hash if user else _DUMMY_HASH, password)
        ok = user is not None and user.status == "active"
    except (VerificationError, InvalidHashError):
        ok = False
    if not ok or user is None:
        login_limiter.fail(username, ip)
        raise ApiError(401, "invalid_credentials", "Invalid username or password")
    login_limiter.reset(username, ip)
    user.last_login_at = utcnow()
    return user


def start_session(db: Session, user: User, ip: str | None, user_agent: str | None) -> tuple[str, AuthSession]:
    token = secrets.token_urlsafe(32)
    now = utcnow()
    session = AuthSession(
        user_id=user.id, token_hash=_token_hash(token), csrf_token=secrets.token_urlsafe(32),
        expires_at=now + timedelta(hours=get_settings().session_ttl_hours), last_seen_at=now,
        ip=ip, user_agent=(user_agent or "")[:300],
    )
    db.add(session)
    db.flush()
    return token, session


def resolve_session(db: Session, token: str | None) -> tuple[User, AuthSession] | None:
    if not token:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == _token_hash(token)))
    now = utcnow()
    idle = timedelta(minutes=get_settings().session_idle_minutes)
    if session is None or session.revoked_at or session.expires_at <= now or session.last_seen_at + idle <= now:
        return None
    user = db.get(User, session.user_id)
    if user is None or user.status != "active":
        return None
    if now - session.last_seen_at > timedelta(minutes=1):
        session.last_seen_at = now
        db.commit()
    return user, session


def csrf_ok(session: AuthSession, header_value: str | None) -> bool:
    return bool(header_value) and hmac.compare_digest(session.csrf_token, header_value or "")


def revoke(db: Session, session: AuthSession) -> None:
    session.revoked_at = utcnow()


@dataclass
class Membership:
    role: str
    permissions: set[str]


def membership(db: Session, user_id: uuid.UUID, project_id: uuid.UUID) -> Membership | None:
    member = db.get(ProjectMember, (project_id, user_id))
    if member is None:
        return None
    perms = set(db.scalars(select(RolePermission.permission_key).where(RolePermission.role_key == member.role_key)))
    return Membership(member.role_key, perms)


def authorize(db: Session, user: User | None, project_id: uuid.UUID, permission: str, what: str = "resource") -> Membership:
    """Non-members get 404 (existence is not leaked); members without the permission get 403."""
    m = membership(db, user.id, project_id) if user else None
    if m is None:
        raise not_found(what)
    if permission not in m.permissions:
        raise forbidden(permission)
    return m


def add_member(db: Session, project_id: uuid.UUID, user_id: uuid.UUID, role: str) -> None:
    db.merge(ProjectMember(project_id=project_id, user_id=user_id, role_key=role))


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(User.created_at.asc())))
