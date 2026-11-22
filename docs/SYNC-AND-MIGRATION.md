# Guest data, sync and migration

Two separate operations, deliberately not merged: upgrading the *guest's own*
storage, and attaching guest records to an account.

## 1. Guest storage upgrade (local, automatic, versioned)

The oldest saved progress used bare ids (`de1`) under the key
`raman-cia2-sprint-v1`. The key is unchanged so existing work is found, and
`src/client/core/migration.js` upgrades it in place.

- **Deterministic mapping**, built from the authored catalog, not string
  guessing: `de1 -> cia-2-2025-26:de:de1`, `py10 -> cia-2-2025-26:py:py10`.
  Sources are topic status, completion times, revision and confidence, notes,
  missed questions, the active quiz and its answers, quiz history, long-answer
  drafts/scores/practice flags, the custom plan's blocks and backlog, and chat
  references.
- **The original is preserved.** Before writing anything the raw value is copied
  to `study-sprint:migration-backup:2`, written once and never overwritten. The
  live key is then replaced with the upgraded state.
- **Recoverable after interruption.** The backup is written first; the new state
  is serialised, parsed back and validated before it replaces the live key; the
  completion marker `study-sprint:migrated` is written last. A failure at any
  step leaves the previous state intact and a reload retries.
- **Idempotent.** A second run finds nothing to rewrite and only refreshes the
  marker. `MIGRATION_VERSION` increments if the layout changes again.
- **Unmapped records are kept, not discarded.** Any identifier that cannot be
  mapped (removed topic, a typo, an old subject) is listed in `state.unmapped`
  with its source, shown to the student, and left for a later recovery pass.

## 2. Importing guest records into an account (explicit)

Signing in never uploads anything by itself. **Account → Import guest progress**
builds a preview from the guest state and the account's existing records:

- **New records** are listed as independent.
- **Records the account already has** are marked overlapping, and the student
  chooses: keep the newest, keep the guest version, or keep the account version.
  Nothing is applied silently.
- **Unmappable records** are reported and left on the device.
- **Self-reported, not verified.** Imported status and completion are stored as
  the student's own progress. The import result is labelled as self-reported and
  is never presented as an examined assessment.

The import is idempotent in effect: re-running it with the same source data
writes the same values, and an already-imported record simply matches.

## 3. Synchronisation once signed in

| State | Shown as | What happens |
| --- | --- | --- |
| Editing | `Saving…` | Writes are queued and debounced (900 ms); typing does not send one request per key |
| Confirmed | `Saved` | Only after the server confirms. Never optimistically |
| No connection | `Offline — changes kept on this device` | The queue is durable in IndexedDB (localStorage fallback) and is scoped to the account, so a reload or a closed laptop keeps the edit |
| Refused | `Sync failed` | A non-conflict error; the entry stays queued for retry |
| Stale | `Conflicted — choose which version to keep` | A dialog offers keep-account, replace-with-mine, or decide later. The edit is kept until the student chooses |

Details that matter:

- **Scoped by account.** Cached state and pending writes live under
  `study-sprint:acct:<userId>:…` and in a queue keyed by the same account. Signing
  out clears that account's cache; a second account cannot see the first's drafts.
- **One client, one session.** Reads and writes use the same SDK client that holds
  the session, so the data API and the session can never diverge.
- **Local cache even when offline.** A signed-in student's state is cached for a
  fast reload and for working offline; the database remains the source of truth
  once a write is confirmed.
