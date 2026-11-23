export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

/** Splits a duration into whole days/hours/minutes/seconds. Negative input counts as zero. */
export function splitDuration(ms: number): DurationParts {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3_600),
    minutes: Math.floor((totalSeconds % 3_600) / 60),
    seconds: totalSeconds % 60,
  };
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

/** e.g. "10:00 – 10:05 (5 mins)" in the viewer's locale and timezone. */
export function formatSalePeriod(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  const length = minutes < 120 ? `${minutes} mins` : `${Math.round(minutes / 60)} hours`;
  return `${timeFormat.format(start)} – ${timeFormat.format(end)} (${length})`;
}

export function formatPrice(amount: string, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(Number(amount));
}
