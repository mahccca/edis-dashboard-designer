"""Linear unit catalog (A-11). Offsets (e.g. °C/K) are not needed in v1 and are not convertible."""

UNITS: dict[str, tuple[str, float]] = {
    "": ("none", 1.0),
    "W": ("power", 1.0), "kW": ("power", 1e3), "MW": ("power", 1e6), "kWp": ("power", 1e3),
    "Wh": ("energy", 1.0), "kWh": ("energy", 1e3), "MWh": ("energy", 1e6),
    "V": ("voltage", 1.0), "A": ("current", 1.0), "Hz": ("frequency", 1.0),
    "°C": ("temperature", 1.0),
    "%": ("ratio", 1.0),
    "W/m2": ("irradiance", 1.0), "kW/m2": ("irradiance", 1e3),
    "Wh/m2": ("irradiation", 1.0), "kWh/m2": ("irradiation", 1e3),
    "h": ("duration", 1.0),
}


class UnitError(ValueError):
    pass


def convert(value: float, src: str, dst: str) -> float:
    if src == dst:
        return value
    if src not in UNITS or dst not in UNITS:
        raise UnitError(f"unknown unit {src!r} or {dst!r}")
    (q1, f1), (q2, f2) = UNITS[src], UNITS[dst]
    if q1 != q2:
        raise UnitError(f"cannot convert {src} ({q1}) to {dst} ({q2})")
    return value * f1 / f2
