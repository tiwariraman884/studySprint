# Course packs

A course pack is shared academic content, versioned as a whole. Student progress
never lives inside a pack.

## Format

The authored modules in `src/content/subjects/` are wrapped by
`src/content/packs/course-pack.js` into one document:

```
id, version, title, description, institution, programme, branch,
academicYear, syllabusVersion, publicationStatus, reviewedBy, reviewedAt,
license, author,
subjects[] { subject{key}, curriculum{code, examUnits}, units[], topics[], resources[] },
chapterQuestions[], quiz[], long[], labs[], counts{}
```

Rules enforced by `validatePack` (used by the importer and the tests):

- Pack id: lowercase kebab-case, 3–64 characters.
- Version: `1.0.0` style; a new version is a new row, never an edit of an old one.
- Every topic id is qualified with its pack: `cia-2-2025-26:de:de1`. A topic id
  must be unique inside the pack, carry a positive duration and four distinct
  MCQ options with an answer index.
- Questions, quiz items and long answers must reference a subject in the pack,
  and a topic reference must exist.

## Publication status

`authored`, `imported`, `needs-review`, `reviewed`, `retired`. The first pack is
`imported`: written from one student's 2025–26 course material and re-packaged
for reuse. It is **not** institution-reviewed or syllabus-approved, and the
interface says so. `retired` packs are hidden from students.

No institution is named for the first pack because the source material does not
verify one. Those fields stay empty rather than guessed.

## Seeding and importing

- `npm run seed:packs` regenerates `supabase/seed/10-course-packs.json` and
  appends a content hash. CI runs `node scripts/seed-packs.mjs --check` and fails
  if the file is stale.
- `POST /api/packs/import` accepts that document and requires `IMPORT_TOKEN` in
  the `x-import-token` header. It validates the document, computes the hash if
  absent, and calls `import_course_pack`.
- The SQL function is idempotent: an identical hash is a no-op that returns
  `changed: false`. Re-running the seed never duplicates content (the integration
  test asserts 104 topics and 1 version after a second run).

## Versions and existing learners

- Importing a new version makes it current and leaves the previous version
  readable. A saved plan that references an older version still renders.
- Every row of the new version is rebuilt from the document; the function
  returns the removed topic keys.
- Progress is keyed by the stable topic key, not a row id, so unchanged topics
  keep their history across versions.
- **A materially changed topic is not automatically inherited.** Progress
  transfers only when the key is unchanged. An author who renames or splits a
  topic is expected to add an explicit equivalence entry; until then the new
  topic starts unstudied and the old progress is preserved and reported. This is
  deliberate: silently crediting a student for content they never saw would be
  worse than an honest gap.

## Adding a pack

1. Author or import the subject modules.
2. Add a meta block and call `buildCoursePack` in `src/content/packs/`.
3. Register it in `src/content/packs/index.js`.
4. Run `npm run seed:packs && npm test`.
5. Import it once with the importer; students can then pick it during onboarding.

A contributor-facing CMS is out of scope for this milestone. The pack contract
and the importer are the extension point a CMS would later write through.
