"""Safe expression engine (parser -> AST -> bounded evaluator) + model checks.

Must stay behaviourally identical to contracts/tools/semantic.py; tests/unit/test_expression_parity.py
runs the contract examples through both.

JSON Schema covers shape; this module covers rules that need the whole
document: unique node ids, slot placement, formula grammar, declared
identifiers and dependency cycles. It is the executable specification the
backend `document_engine` / `modeling` modules must match. Formulas are parsed
by a hand-written recursive-descent parser into the AST described in
expression.schema.json; nothing is ever passed to eval/exec.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Any, Iterator

FUNCTIONS: dict[str, tuple[int, int]] = {
    "abs": (1, 1), "min": (2, 8), "max": (2, 8), "clamp": (3, 3),
    "round": (1, 2), "floor": (1, 1), "ceil": (1, 1), "sqrt": (1, 1),
    "exp": (1, 1), "ln": (1, 1), "log10": (1, 1), "if": (3, 3), "safe_div": (2, 3),
}
_UNARY_FUNCTIONS = {
    "abs": abs, "floor": math.floor, "ceil": math.ceil, "sqrt": math.sqrt,
    "exp": math.exp, "ln": math.log, "log10": math.log10,
}
MAX_DEPTH = 64


@dataclass(frozen=True)
class Issue:
    code: str
    path: str
    message: str


class FormulaError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


_TOKEN = re.compile(
    r"\s*(?:(?P<num>\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?P<id>[A-Za-z_][A-Za-z0-9_]*)"
    r"|(?P<op>==|!=|<=|>=|&&|\|\||[-+*/%^()<>!?:,]))"
)


def tokenize(src: str) -> list[tuple[str, str]]:
    tokens, pos = [], 0
    src = src.rstrip()
    while pos < len(src):
        m = _TOKEN.match(src, pos)
        if not m or m.end() == pos:
            raise FormulaError("syntax_error", f"unexpected character at {pos}: {src[pos:pos + 10]!r}")
        kind = m.lastgroup
        assert kind is not None
        tokens.append((kind, m.group(kind)))
        pos = m.end()
    return tokens


class _Parser:
    def __init__(self, src: str):
        self.toks = tokenize(src)
        self.i = 0
        self.depth = 0

    def peek(self) -> tuple[str, str] | None:
        return self.toks[self.i] if self.i < len(self.toks) else None

    def take(self, value: str | None = None) -> tuple[str, str]:
        tok = self.peek()
        if tok is None or (value is not None and tok[1] != value):
            raise FormulaError("syntax_error", f"expected {value or 'token'}, got {tok[1] if tok else 'end'}")
        self.i += 1
        return tok

    def at(self, *ops: str) -> bool:
        tok = self.peek()
        return tok is not None and tok[0] == "op" and tok[1] in ops

    def parse(self) -> dict:
        node = self.expr()
        if self.peek() is not None:
            raise FormulaError("syntax_error", f"unexpected {self.peek()[1]!r}")
        return node

    def expr(self) -> dict:
        self.depth += 1
        if self.depth > MAX_DEPTH:
            raise FormulaError("too_deep", "expression nesting too deep")
        test = self.binary_level(0)
        if self.at("?"):
            self.take("?")
            then = self.expr()
            self.take(":")
            other = self.expr()
            test = {"k": "cond", "test": test, "then": then, "else": other}
        self.depth -= 1
        return test

    _LEVELS = [("||",), ("&&",), ("==", "!=", "<", "<=", ">", ">="), ("+", "-"), ("*", "/", "%")]

    def binary_level(self, level: int) -> dict:
        if level == len(self._LEVELS):
            return self.unary()
        left = self.binary_level(level + 1)
        while self.at(*self._LEVELS[level]):
            op = self.take()[1]
            right = self.binary_level(level + 1)
            left = {"k": "binary", "op": op, "left": left, "right": right}
            if level == 2:  # comparisons are non-associative
                break
        return left

    def unary(self) -> dict:
        if self.at("-", "!"):
            op = self.take()[1]
            return {"k": "unary", "op": op, "arg": self.unary()}
        base = self.primary()
        if self.at("^"):
            self.take("^")
            return {"k": "binary", "op": "^", "left": base, "right": self.unary()}
        return base

    def primary(self) -> dict:
        tok = self.take()
        kind, val = tok
        if kind == "num":
            return {"k": "num", "v": float(val) if any(c in val for c in ".eE") else int(val)}
        if kind == "id":
            if val in ("true", "false"):
                return {"k": "bool", "v": val == "true"}
            if self.at("("):
                if val not in FUNCTIONS:
                    raise FormulaError("unknown_function", f"function {val!r} is not whitelisted")
                self.take("(")
                args = []
                if not self.at(")"):
                    args.append(self.expr())
                    while self.at(","):
                        self.take(",")
                        args.append(self.expr())
                self.take(")")
                lo, hi = FUNCTIONS[val]
                if not lo <= len(args) <= hi:
                    raise FormulaError("arity", f"{val} takes {lo}..{hi} arguments, got {len(args)}")
                return {"k": "call", "fn": val, "args": args}
            if val.startswith("_"):
                raise FormulaError("syntax_error", "identifiers may not start with '_'")
            return {"k": "ref", "name": val}
        if val == "(":
            node = self.expr()
            self.take(")")
            return node
        raise FormulaError("syntax_error", f"unexpected {val!r}")


def parse_formula(src: str) -> dict:
    return _Parser(src).parse()


def refs(ast: dict) -> Iterator[str]:
    k = ast["k"]
    if k == "ref":
        yield ast["name"]
    elif k == "unary":
        yield from refs(ast["arg"])
    elif k == "binary":
        yield from refs(ast["left"])
        yield from refs(ast["right"])
    elif k == "call":
        for a in ast["args"]:
            yield from refs(a)
    elif k == "cond":
        for part in ("test", "then", "else"):
            yield from refs(ast[part])


class StepLimitExceeded(RuntimeError):
    pass


def evaluate(ast: dict, env: dict[str, float], max_steps: int = 10_000) -> float | bool:
    """Reference evaluator over the AST. Bounded by a step counter."""
    steps = 0

    def ev(n: dict) -> Any:
        nonlocal steps
        steps += 1
        if steps > max_steps:
            raise StepLimitExceeded("evaluation step limit exceeded")
        k = n["k"]
        if k in ("num", "bool"):
            return n["v"]
        if k == "ref":
            return env[n["name"]]
        if k == "unary":
            v = ev(n["arg"])
            return -v if n["op"] == "-" else (not v)
        if k == "cond":
            return ev(n["then"]) if ev(n["test"]) else ev(n["else"])
        if k == "binary":
            op = n["op"]
            if op == "&&":
                return bool(ev(n["left"])) and bool(ev(n["right"]))
            if op == "||":
                return bool(ev(n["left"])) or bool(ev(n["right"]))
            a, b = ev(n["left"]), ev(n["right"])
            return {
                "+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b, "/": lambda: a / b,
                "%": lambda: a % b, "^": lambda: a ** b, "==": lambda: a == b, "!=": lambda: a != b,
                "<": lambda: a < b, "<=": lambda: a <= b, ">": lambda: a > b, ">=": lambda: a >= b,
            }[op]()
        if k == "call":
            fn, args = n["fn"], n["args"]
            if fn == "if":
                return ev(args[1]) if ev(args[0]) else ev(args[2])
            vals = [ev(a) for a in args]
            if fn == "safe_div":
                return vals[0] / vals[1] if vals[1] != 0 else (vals[2] if len(vals) == 3 else 0)
            if fn == "clamp":
                return max(vals[1], min(vals[2], vals[0]))
            if fn == "round":
                return round(vals[0], int(vals[1]) if len(vals) == 2 else 0)
            if fn in ("min", "max"):
                return (min if fn == "min" else max)(vals)
            return _UNARY_FUNCTIONS[fn](vals[0])
        raise ValueError(f"unknown node kind {k}")

    return ev(ast)


def check_model(model: dict) -> list[Issue]:
    issues: list[Issue] = []
    declared: dict[str, str] = {}
    for section in ("inputs", "parameters", "variables", "outputs"):
        for idx, item in enumerate(model.get(section, [])):
            if item["key"] in declared:
                issues.append(Issue("duplicate_key", f"$.{section}[{idx}].key", f"{item['key']} declared twice"))
            declared[item["key"]] = section

    deps: dict[str, set[str]] = {}
    formulas: list[tuple[str, str, str | None]] = []
    for section in ("variables", "outputs"):
        for idx, item in enumerate(model.get(section, [])):
            formulas.append((f"$.{section}[{idx}].formula.expression", item["formula"]["expression"], item["key"]))
    for idx, rule in enumerate(model.get("validation", [])):
        formulas.append((f"$.validation[{idx}].assert", rule["assert"], None))

    for path, src, owner in formulas:
        try:
            ast = parse_formula(src)
        except FormulaError as exc:
            issues.append(Issue(exc.code, path, str(exc)))
            continue
        names = set(refs(ast))
        for name in sorted(names - declared.keys()):
            issues.append(Issue("undeclared_identifier", path, f"{name!r} is not a declared input/parameter/variable"))
        if owner is not None:
            if declared.get(owner) == "outputs" and any(declared.get(n) == "outputs" for n in names):
                issues.append(Issue("output_dependency", path, "outputs may not depend on other outputs"))
            deps[owner] = names & declared.keys()

    state: dict[str, int] = {}

    def visit(node: str, stack: list[str]) -> None:
        state[node] = 1
        for nxt in sorted(deps.get(node, ())):
            if state.get(nxt) == 1:
                cycle = stack[stack.index(nxt):] + [nxt] if nxt in stack else [node, nxt]
                issues.append(Issue("dependency_cycle", "$", " -> ".join(cycle)))
            elif state.get(nxt) is None:
                visit(nxt, stack + [nxt])
        state[node] = 2

    for key in sorted(deps):
        if state.get(key) is None:
            visit(key, [key])
    return issues


def run_model(model: dict, inputs: dict[str, float], parameters: dict[str, float] | None = None) -> dict[str, Any]:
    """Topologically evaluates a semantically valid model (reference implementation for tests)."""
    if check_model(model):
        raise ValueError("model is not semantically valid")
    env: dict[str, Any] = {p["key"]: p["default"] for p in model.get("parameters", [])}
    env.update(parameters or {})
    env.update(inputs)
    for rule in model.get("validation", []):
        if rule["severity"] == "error" and not evaluate(parse_formula(rule["assert"]), env):
            raise ValueError(f"validation failed: {rule['id']}")
    pending = {i["key"]: parse_formula(i["formula"]["expression"]) for s in ("variables", "outputs") for i in model.get(s, [])}
    while pending:
        ready = [k for k, ast in pending.items() if set(refs(ast)) <= env.keys()]
        if not ready:
            raise ValueError("unresolvable inputs: " + ", ".join(sorted(pending)))
        for key in ready:
            env[key] = evaluate(pending.pop(key), env, model["execution"].get("maxEvaluationSteps", 10_000))
    return {o["key"]: env[o["key"]] for o in model["outputs"]}


def _walk(node: dict, path: str) -> Iterator[tuple[dict, str]]:
    yield node, path
    for i, child in enumerate(node.get("children", [])):
        yield from _walk(child, f"{path}.children[{i}]")


def check_document(document: dict, base_path: str = "$") -> list[Issue]:
    issues: list[Issue] = []
    seen: dict[str, str] = {}
    for node, path in _walk(document["root"], f"{base_path}.root"):
        if node["id"] in seen:
            issues.append(Issue("duplicate_node_id", f"{path}.id", f"{node['id']!r} also used at {seen[node['id']]}"))
        else:
            seen[node["id"]] = path
        if node["type"] == "slot" and document["documentType"] != "template":
            issues.append(Issue("slot_outside_template", path, "slot nodes are only allowed in template documents"))
    return issues


def check(kind: str, data: dict) -> list[Issue]:
    """kind is the schema file name, e.g. 'page.schema.json'."""
    if kind in ("page.schema.json", "template-part.schema.json"):
        return check_document(data["document"], "$.document")
    if kind == "document.schema.json":
        return check_document(data)
    if kind == "model.schema.json":
        return check_model(data)
    if kind == "component-definition.schema.json":
        issues = []
        keys = {p["key"] for p in data["properties"]}
        for idx, rule in enumerate(data.get("validationRules", [])):
            try:
                names = set(refs(parse_formula(rule["assert"])))
            except FormulaError as exc:
                issues.append(Issue(exc.code, f"$.validationRules[{idx}].assert", str(exc)))
                continue
            for name in sorted(names - keys):
                issues.append(Issue("undeclared_identifier", f"$.validationRules[{idx}].assert", f"{name!r} is not a property"))
        for key in sorted(set(data["defaults"]) - keys):
            issues.append(Issue("unknown_default", f"$.defaults.{key}", f"default for undeclared property {key!r}"))
        return issues
    return []
