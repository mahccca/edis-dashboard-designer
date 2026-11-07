export function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatFixed(value, digits = 1) {
  const number = asNumber(value);
  if (number === null) return '—';
  return number.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPower(watts) {
  const number = asNumber(watts);
  if (number === null) return '—';
  const kilowatts = number / 1000;
  return `${formatFixed(kilowatts, Math.abs(kilowatts) >= 100 ? 0 : 1)} kW`;
}

export function formatEnergy(kwh) {
  const number = asNumber(kwh);
  if (number === null) return '—';
  return `${formatFixed(number, number >= 100 ? 0 : 1)} kWh`;
}

export function formatClock(value) {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString();
}

export function formatStamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

export function formatHour(bucket) {
  const date = new Date(bucket);
  if (Number.isNaN(date.getTime())) return String(bucket);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
