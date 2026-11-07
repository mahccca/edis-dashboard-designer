import re
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, not_found
from app.modules.iam import service as iam
from app.modules.iam.models import ProjectMember, User
from app.modules.projects.models import Project

SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def to_dict(p: Project) -> dict:
    return {
        "id": str(p.id), "slug": p.slug, "name": p.name, "description": p.description, "status": p.status,
        "activeThemeId": None, "runtimeVisibility": p.runtime_visibility, "lockVersion": p.lock_version,
        "createdAt": p.created_at.isoformat(), "updatedAt": p.updated_at.isoformat(),
    }


def create(db: Session, user: User, slug: str, name: str, description: str | None) -> Project:
    if not user.is_platform_admin:
        raise ApiError(403, "forbidden", "Permission denied", "requires platform.create_project")
    if not SLUG.match(slug) or len(slug) > 120:
        raise ApiError(422, "validation_failed", "Validation failed",
                       errors=[{"pointer": "/slug", "code": "pattern", "message": "lower-case letters, digits and '-'"}])
    project = Project(slug=slug, name=name, description=description, created_by=user.id)
    db.add(project)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise conflict("slug_taken", "Project slug already exists") from exc
    iam.add_member(db, project.id, user.id, "owner")
    return project


def list_for(db: Session, user: User, q: str | None, limit: int) -> list[Project]:
    stmt = (select(Project).join(ProjectMember, ProjectMember.project_id == Project.id)
            .where(ProjectMember.user_id == user.id, Project.status == "active").order_by(Project.created_at))
    if q:
        stmt = stmt.where(Project.name.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    return list(db.scalars(stmt.limit(limit)))


def get(db: Session, project_id: uuid.UUID) -> Project:
    project = db.get(Project, project_id)
    if project is None:
        raise not_found("project")
    return project


def by_slug(db: Session, slug: str) -> Project | None:
    return db.scalar(select(Project).where(Project.slug == slug, Project.status == "active"))
