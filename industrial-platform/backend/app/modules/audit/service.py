import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.modules.audit.models import AuditLog


def record(db: Session, *, action: str, entity_type: str, entity_id: Any, actor: uuid.UUID | None,
           project_id: uuid.UUID | None = None, summary: dict[str, Any] | None = None,
           request_id: str | None = None, ip: str | None = None) -> None:
    db.add(AuditLog(action=action, entity_type=entity_type, entity_id=str(entity_id), actor_user_id=actor,
                    project_id=project_id, summary=summary or {}, request_id=request_id, ip=ip))
