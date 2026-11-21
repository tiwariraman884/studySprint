// Local-date helpers.
//
// Study dates (exam dates, plan start, today) are calendar days, not instants.
// They are stored as "YYYY-MM-DD" strings and converted with a noon anchor so
// daylight-saving changes can never shift a day. The "today" value comes from
// the student's own clock (local time zone), never from UTC.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateString(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const d = new Date(value + "T12:00:00");
  if (Number.isNaN(d.getTime())) return false;
  // Reject impossible dates such as 2026-02-31, which JS would roll over.
  const [y, m, day] = value.split("-").map(Number);
  return (
    d.getFullYear() === y && d.getMonth() + 1 === m && d.getDate() === day
  );
}

/** Local calendar date for a Date object (default: now). */
export function localISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Local date + n days, still a calendar day. */
export function addDays(isoDate, n) {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + n);
  return localISODate(d);
}

/** Whole-day difference: days from a to b. */
export function daysBetween(a, b) {
  return Math.round(
    (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000,
  );
}

/** 1-based plan day for `today` within a plan that starts on `start`. */
export function planDayFor(today, start) {
  if (!isDateString(today) || !isDateString(start)) return 1;
  return Math.max(1, daysBetween(start, today) + 1);
}

/** Local midnight instant for an ISO date, for non-plan timestamps. */
export function dayStart(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function formatDay(isoDate, locale = "en-GB") {
  return new Date(isoDate + "T12:00:00").toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
  });
}
