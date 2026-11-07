from pathlib import Path

import pytest
import yaml
from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename

ROOT = Path(__file__).resolve().parents[1]
SPEC_PATH = ROOT / "openapi" / "openapi.yaml"
METHODS = {"get", "put", "post", "patch", "delete"}


@pytest.fixture(scope="module")
def spec() -> dict:
    return yaml.safe_load(SPEC_PATH.read_text(encoding="utf-8"))


def operations(spec):
    for path, item in spec["paths"].items():
        for method, op in item.items():
            if method in METHODS:
                yield path, method, op


def test_openapi_document_is_valid_3_1():
    spec_dict, base_uri = read_from_filename(str(SPEC_PATH))
    assert spec_dict["openapi"].startswith("3.1")
    validate(spec_dict, base_uri=base_uri)


def _resolve_pointer(doc, pointer: str):
    node = doc
    for part in [p for p in pointer.split("/") if p]:
        node = node[part.replace("~1", "/").replace("~0", "~")]
    return node


def _refs(node):
    if isinstance(node, dict):
        if isinstance(node.get("$ref"), str):
            yield node["$ref"]
        for value in node.values():
            yield from _refs(value)
    elif isinstance(node, list):
        for value in node:
            yield from _refs(value)


def test_every_ref_resolves(spec):
    import json

    for ref in set(_refs(spec)):
        file_part, _, pointer = ref.partition("#")
        if file_part:
            target = (SPEC_PATH.parent / file_part).resolve()
            assert target.is_file(), ref
            doc = json.loads(target.read_text(encoding="utf-8"))
        else:
            doc = spec
        _resolve_pointer(doc, pointer)


def test_operation_ids_unique_and_permissions_declared(spec):
    ids = [op["operationId"] for _, _, op in operations(spec)]
    assert len(ids) == len(set(ids))
    missing = [f"{m.upper()} {p}" for p, m, op in operations(spec) if "x-permission" not in op]
    assert not missing, missing


def test_if_match_operations_document_412(spec):
    for path, method, op in operations(spec):
        params = [p.get("$ref", "") for p in op.get("parameters", [])]
        if "#/components/parameters/IfMatch" in params:
            assert "412" in op["responses"], f"{method.upper()} {path}"


def test_errors_use_problem_json(spec):
    for name, resp in spec["components"]["responses"].items():
        assert list(resp["content"]) == ["application/problem+json"], name


def test_mvp_surface_present(spec):
    required = {
        ("post", "/auth/login"),
        ("post", "/projects"),
        ("post", "/projects/{projectId}/components"),
        ("post", "/projects/{projectId}/objects"),
        ("post", "/projects/{projectId}/data-bindings"),
        ("post", "/projects/{projectId}/pages"),
        ("put", "/pages/{pageId}/document"),
        ("post", "/pages/{pageId}/publish"),
        ("post", "/pages/{pageId}/revisions/{revisionNo}/restore"),
        ("post", "/pages/{pageId}/published-versions/{versionNo}/activate"),
        ("post", "/models/{modelId}/runs"),
        ("get", "/model-runs/{runId}/results"),
        ("post", "/projects/{projectId}/previews"),
        ("get", "/runtime/sites/{projectSlug}/resolve"),
    }
    present = {(m, p) for p, m, _ in operations(spec)}
    assert required <= present, required - present
