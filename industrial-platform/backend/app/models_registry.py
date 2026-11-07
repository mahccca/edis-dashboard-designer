"""Imports every module's models so Alembic and tests see the full metadata."""

from app.core.db import Base
from app.modules.audit import models as _audit  # noqa: F401
from app.modules.components import models as _components  # noqa: F401
from app.modules.data_bindings import models as _bindings  # noqa: F401
from app.modules.data_sources import models as _sources  # noqa: F401
from app.modules.design import models as _design  # noqa: F401
from app.modules.iam import models as _iam  # noqa: F401
from app.modules.industrial_objects import models as _objects  # noqa: F401
from app.modules.projects import models as _projects  # noqa: F401

metadata = Base.metadata
