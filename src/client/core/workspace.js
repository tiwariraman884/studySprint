// Account state: the bridge between saved records (guest or cloud) and the
// feature modules.
//
// It owns three things and nothing else:
//   * which course pack and subjects the student works with;
//   * the profile and study preferences;
//   * the sync status the interface shows (saving, saved, offline, failed, …).
//
// The feature modules keep reading `app.SUBJECTS`, `app.TOPICS`, `app.s.*` as
// before; this module rebuilds those views when the selection changes so every
// page (dashboard, planner, revision, quizzes, materials) respects it
// automatically.

import { PACKS, DEFAULT_PACK_ID, resolvePack } from "../../content/packs/index.js";
import {
  normalizeSelection,
  selectedSubjectList,
  selectedTopics,
  filteredLongAnswers,
  filteredChapterQuestions,
  shortBank,
  quizBank,
  groupTopicsBySubject,
} from "../../content/catalog.js";
import { initialsOf, normalizeProfile, normalizePreferences } from "./profile.js";

export const STORAGE_STATE = {
  guest: "guest",
  loading: "loading",
  cloud: "cloud",
  offline: "offline",
};

/** Curated, honest pack catalogue shipped with this build. */
export function packCatalogue(packs = PACKS) {
  return packs.map((pack) => ({
    id: pack.id,
    title: pack.title,
    description: pack.description,
    academicYear: pack.academicYear,
    syllabusVersion: pack.syllabusVersion,
    publicationStatus: pack.publicationStatus,
    reviewed: pack.reviewedBy ? `${pack.reviewedBy}` : null,
    subjectCount: pack.counts.subjects,
    topicCount: pack.counts.topics,
    subjects: pack.subjects.map((s) => ({
      key: s.subject.key,
      name: s.subject.name,
      short: s.subject.short,
      description: s.subject.description,
      icon: s.subject.icon,
      color: s.subject.color,
      topicCount: s.topics.length,
    })),
  }));
}

/**
 * Derive the view the feature modules use from the selected pack and subjects.
 * Returns a plain object so it is trivially testable.
 */
export function buildPackView({ packId, subjectKeys, packs = PACKS }) {
  const { pack, fallback } = resolvePack(packId || DEFAULT_PACK_ID, packs);
  const keys = normalizeSelection(pack, subjectKeys);
  const topics = selectedTopics(pack, keys);
  const subjects = selectedSubjectList(pack, keys);
  const long = filteredLongAnswers(pack, keys);
  const chapter = filteredChapterQuestions(pack, keys);
  return {
    pack,
    fallback,
    packId: pack.id,
    subjectKeys: keys,
    subjects,
    topics,
    long,
    chapter,
    short: shortBank(pack, keys),
    quiz: quizBank(pack, keys),
    curriculum: (pack.subjects || [])
      .filter((s) => keys.includes(s.subject.key))
      .map((s) => ({ ...s.curriculum, id: s.subject.key, name: s.subject.name })),
    bySubject: groupTopicsBySubject(topics),
  };
}

/** Human summary used in the sidebar and on the dashboard. */
export function describeWorkspace({ profile, packId, subjectKeys, storage }) {
  const name = normalizeProfile(profile || {}).displayName || "Student";
  const view = buildPackView({ packId, subjectKeys });
  return {
    name,
    initials: initialsOf(name),
    packTitle: view.pack.title,
    subjectCount: view.subjectKeys.length,
    topicCount: view.topics.length,
    storage,
  };
}

/** Study preferences with defaults, shared by onboarding and the planner. */
export function preferencesWithDefaults(prefs) {
  return normalizePreferences(prefs || {});
}

/** Subject progress for the selected subjects, ordered like the pack. */
export function subjectProgress(view, statusOf) {
  return view.subjects.map((subject) => {
    const topics = view.bySubject.get(subject.key) || [];
    const done = topics.filter((t) => statusOf(t.id) === "done").length;
    const weak = topics.filter((t) => statusOf(t.id) === "weak").length;
    return {
      key: subject.key,
      name: subject.name,
      icon: subject.icon,
      color: subject.color,
      topics: topics.length,
      done,
      weak,
      percent: topics.length ? Math.round((done / topics.length) * 100) : 0,
    };
  });
}

export const SYNC_LABEL = {
  idle: "",
  saving: "Saving…",
  saved: "Saved",
  offline: "Offline — changes kept on this device",
  failed: "Sync failed",
  conflict: "Conflicts need your attention",
};

export const AUTH_STATUS_LABEL = {
  guest: "Guest mode — saved on this device",
  loading: "Checking your account…",
  signedIn: "Signed in — syncing across devices",
  offline: "Offline — changes kept on this device",
  unconfigured: "Cloud accounts are not configured — guest mode only",
  expired: "Session expired — sign in to sync again",
};
