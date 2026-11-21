// Student profile and preferences. Pure functions only: validation, defaults
// and normalisation are shared by the onboarding form, the profile editor, the
// backup importer and the automated tests.

export const LANGUAGE_LABELS = {
  en: "English",
  "hi-en": "Hinglish (English + Hindi)",
};

export const THEMES = ["dark", "light"];

export const GUEST_DISPLAY_NAME = "Student";

export const DEFAULT_PROFILE = Object.freeze({
  displayName: GUEST_DISPLAY_NAME,
  institution: "",
  programme: "",
  branch: "",
  semester: null,
  explanationLanguage: "en",
  onboardingCompletedAt: null,
  collegeId: "",
  admissionBatch: "",
  academicSemester: null,
  firstYearGroup: "A",
  bridgeCourses: false,
  confirmedAlternatives: {},
});

export const DEFAULT_PREFERENCES = Object.freeze({
  hoursPerDay: 4,
  studyDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  planDays: 7,
  scope: "exam",
  excludeDone: true,
});

export const STUDY_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const cleanText = (value, max) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

export function normalizeProfile(raw = {}) {
  const semester = Number(raw.semester);
  return {
    displayName: cleanText(raw.displayName, 60) || GUEST_DISPLAY_NAME,
    institution: cleanText(raw.institution, 120),
    programme: cleanText(raw.programme, 120),
    branch: cleanText(raw.branch, 120),
    semester: Number.isInteger(semester) && semester >= 1 && semester <= 12 ? semester : null,
    explanationLanguage: raw.explanationLanguage === "hi-en" ? "hi-en" : "en",
    onboardingCompletedAt: raw.onboardingCompletedAt || null,
    collegeId: cleanText(raw.collegeId, 64),
    admissionBatch: cleanText(raw.admissionBatch, 20),
    academicSemester: Number.isInteger(Number(raw.academicSemester)) && Number(raw.academicSemester) >= 1 && Number(raw.academicSemester) <= 4 ? Number(raw.academicSemester) : null,
    firstYearGroup: raw.firstYearGroup === "B" ? "B" : "A",
    bridgeCourses: raw.bridgeCourses === true,
    confirmedAlternatives: raw.confirmedAlternatives && typeof raw.confirmedAlternatives === "object" ? raw.confirmedAlternatives : {},
  };
}

/**
 * Field-level validation for the onboarding and profile forms. Optional fields
 * (institution, programme, branch, semester) are never required, so a student
 * can skip them.
 */
export function validateProfile(raw = {}) {
  const errors = {};
  const name = cleanText(raw.displayName, 60);
  if (!name) errors.displayName = "Enter the name you want to study under.";
  else if (name.length < 1) errors.displayName = "That name is too short.";
  if (typeof raw.institution === "string" && raw.institution.length > 120)
    errors.institution = "Keep the institution under 120 characters.";
  if (typeof raw.programme === "string" && raw.programme.length > 120)
    errors.programme = "Keep the programme under 120 characters.";
  if (typeof raw.branch === "string" && raw.branch.length > 120)
    errors.branch = "Keep the branch under 120 characters.";
  if (raw.semester !== null && raw.semester !== "" && raw.semester !== undefined) {
    const semester = Number(raw.semester);
    if (!Number.isInteger(semester) || semester < 1 || semester > 12)
      errors.semester = "Semester must be a whole number from 1 to 12.";
  }
  if (!["en", "hi-en"].includes(raw.explanationLanguage || "en"))
    errors.explanationLanguage = "Choose English or Hinglish.";
  return errors;
}

export function initialsOf(displayName) {
  const parts = cleanText(displayName, 60).split(" ").filter(Boolean);
  if (!parts.length) return "ST";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function normalizePreferences(raw = {}) {
  const hours = Number(raw.hoursPerDay);
  const days = Number(raw.planDays);
  const studyDays =
    Array.isArray(raw.studyDays) && raw.studyDays.length
      ? STUDY_DAYS.filter((d) => raw.studyDays.includes(d))
      : [...STUDY_DAYS];
  return {
    hoursPerDay:
      Number.isFinite(hours) && hours >= 0.5 && hours <= 12
        ? Math.round(hours * 2) / 2
        : DEFAULT_PREFERENCES.hoursPerDay,
    studyDays: studyDays.length ? studyDays : [...STUDY_DAYS],
    planDays: Number.isInteger(days) && days >= 1 && days <= 60 ? days : DEFAULT_PREFERENCES.planDays,
    scope: raw.scope === "full" ? "full" : "exam",
    excludeDone: raw.excludeDone !== false,
  };
}

export function validatePreferences(raw = {}) {
  const errors = {};
  const hours = Number(raw.hoursPerDay);
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 12)
    errors.hoursPerDay = "Study hours per day must be between 0.5 and 12.";
  const days = Number(raw.planDays);
  if (!Number.isInteger(days) || days < 1 || days > 60)
    errors.planDays = "Plan length must be a whole number of days from 1 to 60.";
  if (Array.isArray(raw.studyDays) && raw.studyDays.length === 0)
    errors.studyDays = "Choose at least one study day.";
  return errors;
}

/** Weekday key (mon..sun) for a local YYYY-MM-DD date. */
export function weekdayKey(isoDate) {
  const d = new Date(isoDate + "T12:00:00");
  return STUDY_DAYS[(d.getDay() + 6) % 7];
}
