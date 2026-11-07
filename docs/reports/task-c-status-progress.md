# Task C: Status, journal, achievements and Game Pass departures

Implemented on branch `Strugglechen1337/nq-status`.

## Additive schema changes

All columns are nullable, added only when absent after `PRAGMA table_info`; no existing column, table, row or setting is rewritten by migration.

| Table | Column | SQLite type | Meaning |
| --- | --- | --- | --- |
| games | status | TEXT | open, wanted, playing, paused, abandoned, completed; NULL derives from completed |
| games | user_note | TEXT | Personal note, maximum 20000 characters via API |
| games | user_rating | INTEGER | 1 to 5; NULL clears rating |
| ownerships | achievements_earned | INTEGER | Earned achievement count |
| ownerships | achievements_total | INTEGER | Total achievement count |
| ownerships | progress_pct | REAL | Achievement/trophy progress from 0 to 100 |
| ownerships | leaving_soon | INTEGER | Optional Game Pass departure flag; writes scoped to gamepass |

New settings keys: **none**.

## Behavior and data safeguards

Status and completed are written together, including the existing checkbox; old completed rows are read as completed without rewriting them. The game PATCH is transactional, including journal validation and metadata merge. Merge copies notes and ratings only into an empty target, transfers status into an unset/open target, and retains the existing completed-wins behavior.

Suggestions exclude abandoned/completed games and slightly favor wanted/playing games and available Game Pass departures. Both responsive library filters include all statuses, personal-rating sorting and a leaving-soon ownership filter. Notes and rating have an explicit Save action. Cards show the highest available platform achievement percentage, while detail lists the individual platforms and optional counts.

Xbox consumes existing title-history achievements and uses Gamerscore ratio only as a percentage fallback. Steam queries only the most recent 50 games played within 90 days, with per-call timeout and tolerated errors. PSN adds a paged optional trophy list; normalized names match conservatively and ambiguous duplicate trophy names are skipped. Unavailable optional data preserves previously recorded values. No platform pruning logic or deletion safeguards were changed.

## Live catalog verification

On 2026-11-07, Microsoft's own [catalog script](https://www.xbox.com/en-us/xbox-game-pass/games/js/xgpcatPopulate-2025.js) listed console `393f05bf-e596-4ef6-9487-6d4fa0eab987` and PC `cc7fc951-d00f-410e-9e02-5e4628e04163` under leavingsoon. Both v2 endpoints were fetched successfully for DE/de-de and returned the departure heading and 14 product IDs. Failed optional departure catalogs are silently omitted from updates and do not affect the authoritative product list or pruning.

PSN endpoint reference: [psn-api getUserTitles source](https://raw.githubusercontent.com/achievements-app/psn-api/main/src/trophy/user/getUserTitles.ts). Steam endpoint reference: [Steamworks ISteamUserStats](https://partner.steamgames.com/doc/webapi/ISteamUserStats#GetPlayerAchievements).

## Validation

- `npm.cmd install`: succeeded, no new dependencies or lockfile changes.
- `npx.cmd next typegen`, then `npx.cmd tsc --noEmit`: succeeded.
- `npm.cmd run lint`: succeeded, zero errors.
- `npm.cmd run build`: succeeded (Next.js 16.4.5).
- `npm.cmd test`: 38 passed, zero failures.
- Tests cover status/completed equivalence, legacy completed rows, merge journal preservation, invalid review values, Xbox/PSN/Steam progress with mocked responses, Steam recent-game cap/private responses, Game Pass scoped departure marking and unavailable optional catalogs.
- The migration fixture retains original games, ownerships, credentials and metadata, reopens idempotently, verifies all seven new columns, rollback and SQLite quick_check.
- `git diff --check` and UTF-8 scan of changed/new code: clean; no mojibake or replacement characters.

## Headless Edge visual evidence

Used isolated DATA_DIR `<TEMP>/nq-status-ui-20261107`, `POST /api/demo`, and additional fixture-only review/progress/departure values. Production server port 3147. No production database was used. Edge screenshots were captured with headless=new, disable-gpu, hide-scrollbars and requested window sizes; CDP device metrics were also set to exactly 390x844 because Edge otherwise imposes a 492px minimum inner viewport. All images below were visually inspected. Edge and the test server were stopped afterward.

- `<TEMP>/nq-status-mobile.png` (390x844 library)
- `<TEMP>/nq-status-mobile-filter.png` (390x844 bottom sheet)
- `<TEMP>/nq-status-mobile-detail.png` (390x844 journal and departure badge)
- `<TEMP>/nq-status-mobile-progress.png` (390x844 platform progress)
- `<TEMP>/nq-status-desktop.png` (1440x900 library)
- `<TEMP>/nq-status-desktop-detail.png` (1440x900 journal)
- `<TEMP>/nq-status-desktop-progress.png` (1440x900 platform progress)

No remaining implementation work. PSN trophy matching deliberately leaves ambiguous titles without new progress instead of guessing.
