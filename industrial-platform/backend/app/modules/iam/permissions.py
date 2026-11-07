"""Permission catalog and system role grants. The initial migration seeds a frozen copy of this."""

PERMISSIONS: dict[str, str] = {
    "project.view": "View project",
    "project.manage": "Edit/archive project",
    "project.manage_members": "Manage members and roles",
    "project.audit": "Read audit log",
    "page.view": "View pages and drafts",
    "page.edit": "Edit pages, dashboards and data bindings",
    "page.publish": "Publish / roll back pages",
    "template.edit": "Edit templates, headers, footers, menus",
    "template.publish": "Publish templates and template parts",
    "theme.edit": "Edit themes",
    "theme.publish": "Publish themes",
    "component.use": "Use components from the library",
    "component.edit": "Create/edit component definitions",
    "component.publish": "Publish/deprecate component versions",
    "object.view": "View industrial objects and values",
    "object.edit": "Create/edit industrial objects",
    "object_type.edit": "Create/edit object types",
    "data_source.view": "View data sources",
    "data_source.manage": "Create/edit data sources and credentials",
    "model.view": "View models and runs",
    "model.edit": "Edit models",
    "model.run": "Run models",
    "model.publish": "Publish models",
    "runtime.view": "View published runtime pages",
}

_DESIGNER = [
    "project.view", "page.view", "page.edit", "page.publish", "template.edit", "template.publish",
    "theme.edit", "theme.publish", "component.use", "component.edit", "component.publish",
    "object.view", "data_source.view", "model.view", "runtime.view",
]
_ENGINEER = [
    "project.view", "page.view", "component.use", "object.view", "object.edit", "object_type.edit",
    "data_source.view", "data_source.manage", "model.view", "model.edit", "model.run", "model.publish",
    "runtime.view",
]

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "owner": list(PERMISSIONS),
    "admin": list(PERMISSIONS),
    "designer": _DESIGNER,
    "engineer": _ENGINEER,
    "operator": ["project.view", "runtime.view", "object.view", "model.view", "model.run"],
    "viewer": ["project.view", "page.view", "runtime.view", "object.view"],
}
