import pytest

from app.core.db import uuid7
from app.modules.industrial_objects.units import UnitError, convert


def test_uuid7_version_variant_and_order() -> None:
    ids = [uuid7() for _ in range(50)]
    assert all(u.version == 7 and u.variant == "specified in RFC 4122" for u in ids)
    assert len(set(ids)) == 50
    assert [u.int >> 80 for u in ids] == sorted(u.int >> 80 for u in ids)


@pytest.mark.parametrize(("value", "src", "dst", "expected"), [
    (412500.0, "W", "kW", 412.5), (1.5, "MW", "kW", 1500.0), (2500.0, "Wh", "kWh", 2.5), (7.0, "kW", "kW", 7.0),
])
def test_unit_conversion(value: float, src: str, dst: str, expected: float) -> None:
    assert convert(value, src, dst) == pytest.approx(expected)


def test_unit_conversion_rejects_other_quantities() -> None:
    with pytest.raises(UnitError):
        convert(1.0, "kW", "kWh")
    with pytest.raises(UnitError):
        convert(1.0, "W", "furlong")
