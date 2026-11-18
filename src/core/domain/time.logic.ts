// Asia/Bangkok is UTC+7 all year with no daylight saving, so it is computed arithmetically.
const BANGKOK_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

const bangkokMidnightUtcMs = (year: number, monthIndex: number): number => {
  const d = new Date(0);
  d.setUTCFullYear(year, monthIndex, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - BANGKOK_OFFSET_MS;
};

export const bangkokDayRange: (now: Date) => { from: Date; to: Date } = (now) => {
  const local = now.getTime() + BANGKOK_OFFSET_MS;
  const from = Math.floor(local / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS;
  return { from: new Date(from), to: new Date(from + DAY_MS) };
};

export const bangkokMonthRange: (month: string) => { from: Date; to: Date } | null = (month) => {
  const m = MONTH_PATTERN.exec(month);
  if (m === null) return null;
  const year = Number(m[1]);
  const index = Number(m[2]) - 1;
  return {
    from: new Date(bangkokMidnightUtcMs(year, index)),
    to: new Date(bangkokMidnightUtcMs(year, index + 1)),
  };
};

/**
 * bangkokMonthRange for a month a caller has already validated (the usage routes check the
 * format). A bad month there is a bug, so it throws instead of returning null.
 */
export const requireBangkokMonthRange: (month: string) => { from: Date; to: Date } = (month) => {
  const range = bangkokMonthRange(month);
  if (range === null) throw new Error('month must be YYYY-MM');
  return range;
};

export const bangkokMonthOf: (now: Date) => string = (now) => {
  const local = new Date(now.getTime() + BANGKOK_OFFSET_MS);
  const year = String(local.getUTCFullYear()).padStart(4, '0');
  const month = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};
