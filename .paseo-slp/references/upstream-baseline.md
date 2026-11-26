# Paseo upstream baseline

Operational facts for the `slp-revibed-upstream-sync` skill
(`.agents/skills/slp-revibed-upstream-sync/SKILL.md`). Each sync reads this file
to start from the last assessed release and updates it at handback, including
a "no plugin change" outcome.

- **Pinned**: the version this checkout builds against (lockfile, or the host
  runtime for unpinned packages). Compatibility is judged against it.
- **Assessed**: the newest release whose delta from Pinned was classified.
  The next sync diffs and reads release notes from Assessed to its target.

| Package | Pinned | Assessed | Coverage | Date | Outcome |
|---|---|---|---|---|---|
| `@getpaseo/plugin` | 0.17.5 | 0.17.5 | Server contracts, lifecycle declarations/runtime and export map diffed from 0.15.4; client declarations covered by typecheck only; 0.16.x–0.17.x release notes not read | 2026-11-26 | SDK updated; hooks register through `addHook` when the host offers it (legacy pair kept for 0.11–0.13); turn-ended `timeline` optional; new hook fields recorded IGNORED in the desk field policy |
| `@getpaseo/client` | 0.17.5 | 0.17.5 | Create/config/timeline declarations and the `featureValues` fold inspected; rest by typecheck; SLP has no direct client import | 2026-11-26 | SDK updated; seat verification reads the agent `options` record; no optional APIs adopted |
| `@getpaseo/protocol` | 0.17.5 | 0.17.5 | `agent-profile`, `agent-types`, `paseo-config-schema`, `plugin-registry`, mutable-config schema diffed from 0.15.4; generated validators and other schemas not reviewed | 2026-11-26 | Root and plugin runtime pins/lockfiles aligned; profile `options` handled through one canonical form |
| `@getpaseo/server` | unpinned host; CI/container parity 0.17.5 | 0.17.5 | Persisted config, config store, option controls, plugin lifecycle, agent create path and plugin-provider registry read; ACP adapter skimmed; web bundles and other internals not audited | 2026-11-26 | Breaking for 0.15.4-era SLP (profile `options`, empty-record drop, `providerOptions` fold); adapted. Host renames of Codex `fast_mode` / Claude `ultracode` are refused with a remedy, not mirrored |
| `@getpaseo/cli` | unpinned host; CI/container 0.17.5 | 0.17.5 | `plugin install/ls/reload/logs` and `daemon run/config set` exercised on a scratch daemon; package not diffed | 2026-11-26 | CI/container parity pins updated; no CLI adaptation |

`requirements.paseo` in `plugin/paseo-plugin.json` is `>=0.11.0` for native
screen/sidebar support on daemon and app. Keep the field present. That current
API floor does not extend the assessed runtime evidence in the table above.
Updating SDK dependencies or documentation never proves live compatibility.

## Coverage and unresolved differences

The assessments remain partial. The 2026-11-26 sync jumps 0.15.4 → 0.17.5 without reading the intermediate release notes; it is driven by the consumed-surface diff, both host-parity runs and a scratch daemon. Consumed changes: saved profiles persist `options` (served with a dated `featureValues` copy, empty records dropped), create hooks see `featureValues` only as a copy of non-empty `providerOptions`, `agent.turn.after` lost `timeline` from the SDK type, hook requests gained `metadata`/`workspaceId`/`background`/`appendSystemPrompt`/`wrap`, and the legacy `on`/`before` pair is removed after 2027-04-30. Not adopted: `appendSystemPrompt`, launch wraps, subscriptions, worktree managers, agent metadata. Open: host-side option-key renames are not mirrored; the app UI, real provider seats, supervision capture shapes and the container harness were not exercised on 0.17.5. The 2026-11-15 sync covers 0.15.3 (iOS keyboard blur fix) and 0.15.4 (Claude Fable/Mythos 5.2); neither changes consumed contracts. New models require Claude Code >=2.1.321, and Mythos requires advertised access; SDK alignment does not establish availability. The 2026-11-06 follow-up covers 0.15.1 (Windows terminal-worker startup fix) and 0.15.2 (project-suggestions RPC, first-run setup UI); both are additive with no consumed-surface change. The 2026-11-04 sync covers 0.15.0-beta.1 and stable 0.15.0 deltas from 0.14.0; CI and container host parity now target 0.15.4 instead of the 0.11.2 floor, so the floor itself is no longer exercised by CI. The 2026-11-02 sync covers changed consumed surfaces through stable 0.14.0; historical unreviewed internals and generated validators remain open. The 2026-10-22 sync covered 0.11.3, 0.11.4,
0.12.0-beta.1 through beta.3 and stable, including stable tarball rechecks. Generated protocol validators and
unconsumed host internals remain unassessed; subsequent syncs start at 0.10.0
for those surfaces. No live 0.11.2, 0.12.0 or 0.14.0 daemon/plugin cutover was performed.
Supervision fixtures were recorded on host 0.9.1 and have not been re-recorded.

`plugin/server/config-view.ts` parses config without stripping a UTF-8 BOM,
which daemon 0.9.2 accepts. Mirroring that behavior remains undecided; a docs
refresh does not authorize a production parser change.

## Evidence provenance

The 2026-11-26 0.17.5 update was requested by the Human as a compatibility
fix; no scratch report was kept (console evidence only, session-local
tarballs). Checks: typecheck, payload parity, the full suite on Node 24
against both 0.15.4 and 0.17.5 host modules, and a disposable 0.17.5 daemon
in an isolated home — directory install to `running`, then activate, identical
re-activate, option removal, clear and deactivate through the plugin RPC, plus
**Reconcile → complete** of an activation the 0.15.4-era plugin had left in
`RECOVERY_REQUIRED` on that daemon. No independent review, app UI session,
real provider seat or container run. `requirements.paseo` stays `>=0.11.0`;
decision: `docs/decisions/2026-11-26-one-form-for-host-option-vocabularies.md`.

The 2026-11-15 0.15.4 assessment, all five baseline/target tarballs, full file
diffs and local check receipts live at
`.local-checks/skill-upstream-sync/0.15.4/` (`impact.md`, `receipts/`). The Human
requested the compatibility update; scope includes SDK/runtime dependency pins,
both npm lockfiles, generated payload, CI/container targets and this baseline,
while retaining `>=0.11.0`. No source adaptation or optional API adoption was
needed. No independent review, live install/reload or container run was performed;
local verification and its limits are recorded in the assessment evidence.

The 2026-11-04 stable 0.15.0 report, tarballs, diffs and check receipts are machine-local at `.local-checks/skill-upstream-sync/0.15.0/` (`impact.md`, `receipts/`); the 0.15.2 delta and receipts are under `.local-checks/skill-upstream-sync/0.15.2/`. Human approved the SDK bump, config compatibility and raising CI/container host parity to the latest assessed host (0.15.2) while retaining `>=0.11.0`. No independent review, live install/reload or container run was performed.

The 2026-11-02 stable 0.14.0 sync report and package diffs are machine-local at
`.local-checks/skill-upstream-sync/0.14.0/impact.md`. Human approved SDK pins,
empty-hook history adaptation and config compatibility while retaining the
manifest floor. The report records exact candidate/check/review evidence and
remaining limits; these table rows record source/package assessment, not live
qualification. Published dates, intermediate 0.13/0.14 release notes and all
five package tarballs were inspected. Optional tools/MCP/translation/host APIs
were not adopted. Empty hooks use one bounded 500-entry history read; missing
turn IDs, incomplete boundaries or failed reads remain unverified.


The 2026-10-22 impact report is console-only in the Human conversation; no
scratch report was granted. Sources: [stable release](https://github.com/getpaseo/paseo/releases/tag/v0.12.0),
intermediate beta release notes, and published npm tarballs for all five
packages. The implementation adds source-derived projection controls and a
fake native-stream adapter test, with source/license details in
[Antigravity support](../../docs/antigravity.md). These are local proof, not a
live compatibility result. `ws-outbound*` generated validators and unrelated
host internals remain unreviewed. The Human subsequently granted isolated Antigravity CLI probes under
`.local-checks/skill-upstream-sync/0.12.0/`. SLP adds per-open stdio/HTTP MCP
relays and role reassertion on every prompt; fake-service probes do not prove
live desk/fleet acceptance or model compliance. Supervision shapes remain
unverified. Native agy 1.4.4 is the qualified minimum for this new family.

The 2026-10-11 tarball/diff assessment used the published
[Paseo v0.11.2 source](https://github.com/getpaseo/paseo/blob/v0.11.2/CHANGELOG.md).
Its raw artifacts were machine-local; the table records the tracked coverage,
not a new test receipt. Earlier host-parity checks used the extracted 0.10.0
server with `PASEO_CLI_MODULES`; their results qualify that earlier target only.

The source-first follow-up preserves episode labels and handles Desk delivery
IDs across legacy inputs and semantic agent-message projections. Public client
0.11.0/0.11.2 drop the additive source/background fields; client 0.12.0 enforces
host capabilities before requests. Mixed clients/hosts may refuse safely; no
plain-send fallback or retry is added. The external analyzer still needs its
implementation migrated to the updated episode input contract.
