const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

function buildIsoDate(year, month, day) {
  const candidate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    candidate.getUTCFullYear() !== Number(year)
    || candidate.getUTCMonth() !== Number(month) - 1
    || candidate.getUTCDate() !== Number(day)
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) return buildIsoDate(match[1], match[2], match[3]);

  match = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return buildIsoDate(year, match[2], match[1]);
  }

  match = text.match(/(\d{1,2})\s+th[aá]ng\s+(\d{1,2})\s+n[aă]m\s+(\d{4})/i);
  return match ? buildIsoDate(match[3], match[2], match[1]) : null;
}

export function daysUntil(dateValue, now = new Date()) {
  const iso = normalizeDate(dateValue);
  if (!iso) throw new Error(`Invalid date: ${dateValue}`);
  const target = new Date(`${iso}T00:00:00`);
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - current.getTime()) / MILLISECONDS_PER_DAY);
}
