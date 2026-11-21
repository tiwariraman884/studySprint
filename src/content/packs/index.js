// Course pack registry. Add a pack here to make it selectable in onboarding.
// Packs are versioned independently; the same file is used by the seed script,
// the importer and the browser so the academic text is authored once.
import CIA2_PACK from "./cia-2-2025-26.js";

export { CIA2_PACK };
export { CIA2_META } from "./cia-2-2025-26.js";
export {
  buildCoursePack,
  validatePack,
  packFingerprint,
  packTopicId,
  subjectKey,
  slug,
  CONTENT_STATUSES,
  PACK_ID_PATTERN,
  TOPIC_ID_PATTERN,
  VERSION_PATTERN,
} from "./course-pack.js";

export const PACKS = [CIA2_PACK];

export const DEFAULT_PACK_ID = CIA2_PACK.id;

export { resolvePack } from "../catalog.js";

export function getPackById(id, packs = PACKS) {
  return packs.find((p) => p.id === id) || null;
}
