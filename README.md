<h1 align="center">SLP Revibed</h1>

<p align="center">
  A <a href="https://paseo.sh">Paseo</a> plugin that runs a <b>Supervisor – Lead – Peer</b> team of
  coding agents: it separates <i>kinds of judgment</i>, not a chain of command.
</p>

<p align="center">
  A maintained fork of <a href="https://github.com/duongvm57/paseo-slp-plugin">paseo-slp</a> by
  Vu Duong, who designed the method and wrote the original plugin.
</p>

Give a **Lead** a bounded objective, or work through an optional **Supervisor**.
The Lead coordinates independent Peers, integrates their work and returns a project verdict.
Each seat is an ordinary Paseo agent with its role instructions loaded separately from your task.
You keep control of intent, important trade-offs and final acceptance.

The plugin also supplies a **repository desk**: durable assignments, current briefs, a native
task queue, declared scopes, selected review obligations, candidate/check evidence and planned
owner handoff. Open **Read SLP work** to inspect registered work without reconstructing it from chat.

![SLP Revibed: Human intent and acceptance, Lead and independent Peers, optional Supervisor, and a durable repository desk for work, review, proof and handoff](docs/images/slp-overview.svg)

## About this project

SLP Revibed continues [paseo-slp](https://github.com/duongvm57/paseo-slp-plugin) by Vu Duong
([@duongvm57](https://github.com/duongvm57)), which is no longer maintained. The role model, the
repository desk and nearly all of the code are that project's work. The name keeps SLP, the Supervisor–Lead–Peer method, and adds a
nod to vibe coding. This fork keeps the method and the repository desk, and differs in three ways:

- **It tracks current Paseo.** It is developed and tested against Paseo **0.17.5**.
- **It is smaller.** Jev-assisted routing and communication supervision, both of which sent
  data to an external judging service, are removed. The Lead chooses each Peer from your pool.
- **It has a new plugin id**, `slp-revibed`. See [Coming from paseo-slp](#coming-from-paseo-slp).

Everything else keeps its name, so existing repositories and configurations keep working: the
**SLP Supervisor** and **SLP Lead** profiles, `slp-<family>-<role>` providers, `slp_*` desk tools,
and each repository's `.paseo-slp/` settings folder.

## When to use it

**Use SLP when:**

- Strong vertical dependencies mean implementation can expose a faulty premise.
- Architecture, lifecycle or ownership is unclear at the start.
- Multiple modules, projects, workspaces, owners and integration boundaries need coordination.
- The project is long or complex enough that you do not want to micromanage each agent.
- Coordination provides more value than its overhead.

**Full SLP is unnecessary when:**

- The task is small and bounded: simple CRUD or a horizontal extension.
- Contracts are clear and dependencies are few.
- One agent can easily handle the work end to end.

**In between:**

- Set up `.paseo-slp/workspace-protocol.md` for minimum sufficient coordination.
- The Lead goes direct to one Peer Engineer; add an Architect or Reviewer only when needed.
- Work directly with the Lead or through an optional Supervisor.

## How work progresses

1. **Set the objective.** Start an **SLP Lead**, or an **SLP Supervisor** that observes or creates a
   Lead. For example: `Fix the checkout total rounding bug. Report back with the candidate and
   the checks you ran.` The Supervisor observes workflow and relays your decisions; it stays
   outside implementation and project acceptance.
2. **Make ownership explicit.** The Lead frames acceptance, dependencies and risks, registers
   work in the desk and decomposes large objectives into tasks. Their dependencies, attempts,
   output judgments and open obligations survive interruption. Each moving scope has
   one writer. Peers can challenge a premise, request a dependency or report blocked.
3. **Select review for the work.** The Lead chooses independent mandates for material questions
   and Human/protocol requirements. There is no fixed reviewer pair or count. Scope changes,
   brief changes and new candidates can invalidate earlier review.
4. **Return evidence.** The desk keeps handback claims separate from candidate observations and
   actual check runs. The Lead resolves findings and disagreements, integrates the work and
   reports what the proof establishes and what remains uncertain.
5. **Continue without losing the work.** A planned handoff uses an owner offer and the receiving
   Lead's acknowledgment under revision checks, keeping the same assignment and history.
   Handoff and resource accounts do not establish project acceptance; that remains yours.

## Why not just subagents

A subagent API creates processes. It does not decide ownership, independent judgment, coordination
or acceptance, and more agents can raise confidence without raising correctness.

| Failure mode              | What goes wrong                                                   | What SLP does                                                           |
| ------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Authority gradient        | The child agrees with the answer the parent already presented     | Peers may challenge the premise; evidence settles it                    |
| Perfect-plan trap         | The coordinator pre-solves the work; the worker becomes a typist  | The Lead delegates outcomes, not file-by-file instructions              |
| Attention dilution        | The coordinator implements and loses the project-wide view        | The Lead integrates; the Supervisor never joins execution               |
| Unsafe parallelism        | Two agents overwrite the same moving files                        | One writer per moving scope; declared scopes and repo isolation tactics |
| Biased or stale review    | The reviewer inherits the author's framing or reads moving files  | Independent review on a stable candidate                                |
| False completion          | `idle`, "done" and green tests are taken as proof                 | Acceptance needs the right artifact reviewed by the right authority     |
| Split control planes      | Workers spawn untracked workers                                   | Paseo is the only control plane; Peers never spawn                      |

The design rationale is in [docs/architecture.md](docs/architecture.md).

## What the plugin does, and what it doesn't

| It does                                                                                     | It refuses                                                                        | It never                                                         |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Registers up to 21 `slp-<family>-<role>` providers and the **SLP Supervisor** / **SLP Lead** profiles | To overwrite a provider or profile it does not own (`COLLISION`)             | Creates an agent on install or activation                        |
| Loads each seat's role instructions at session entry, separate from the task prompt         | To guess when the config drifted outside its journal (`RECOVERY_REQUIRED`)        | Runs a scheduler or agent database; Paseo stays the control plane |
| Keeps a Peer pool that the Lead picks each Peer's runtime from                               | A Peer binding outside the pool during `prepare`                                 | Writes your repository's routing catalog                          |
| Validates launch arguments offline (`prepare`), with named failures                          | Unverified or incompatible provider inventory supplied to `prepare`              | Runs a monitoring daemon; `monitor` is a scan you invoke          |
| Records assignments, briefs, decisions, scopes, selected review and candidate/check evidence | Stale revision pins, overlapping declared scopes and unqualified required reviews | Infers acceptance from a handback, an agent status or a green check |
| Keeps a native dependency queue and performs Lead-invoked dispatch and staged integration   | Unruled or unavailable prerequisites, uncertain effect retries and target drift   | Dispatches, retries, commits or lands work unattended             |
| Supports planned owner handoff and a read-only workspace work panel                         | An acknowledgment that does not match a usable offer and current revision pins    | Sends your prompts or code to a service of its own                |

Saved role choices narrow the Supervisor/Lead providers; all seven Peer providers remain
pool-driven. Provider entries for unavailable CLIs are disabled. Pool checks apply to
`prepare` and native task dispatch. Role rules guide agents, while managed launch and desk checks
cover their own interfaces; repository and shell permissions still come from Paseo and the provider.

## The roles

| Role           | Owns                                                                                   | Never                                                   | Runtime comes from                      |
| -------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| **Human**      | Intent, important trade-offs, exceptional grants, protocol changes, final acceptance   | —                                                       | —                                       |
| **Supervisor** | The quality of the workflow and reasoning; relaying your decisions                     | Implements, or accepts the project                      | The **SLP Supervisor** profile          |
| **Lead**       | Framing, routing, dependencies, integration, the project verdict                       | Pre-solves hard work and hands Peers a typing job        | The **SLP Lead** profile                |
| **Peer**       | One bounded outcome, as an Engineer, Architect, Reviewer or Scout                      | Spawns other agents                                     | An option in the Peer pool, per task    |

Seats run on **Codex, Pi, Devin, Claude Code, OpenCode, Antigravity or Grok**, mixed freely: two
Peers in the same team can use different providers, models and effort levels.
[OpenCode](docs/opencode.md) uses ACP stdio for managed and standalone seats; native OpenCode and
V1 are unsupported. [Grok](docs/grok.md) uses the official Grok Build CLI over ACP, with an
existing `grok login` or `XAI_API_KEY` available to the daemon.
[Antigravity](docs/antigravity.md) requires agy 1.4.4 or newer and the manager plugin; it supports
full access, with thinking effort selected through the model ID.

Peer Engineer is the default implementation writer. An explicit Human assignment or effective
workspace protocol can grant a bounded Lead write for clear, reversible work. One writer,
candidate proof and required independent review still apply; a tiny task grants no exemption.

## Installation

You need:

- **Paseo 0.17.5** daemon and app, the version this plugin is developed and tested against, with
  `pluginsEnabled: true` and an effective `mcp.enabled: true`. The manifest still admits hosts
  from 0.11.0, but older hosts are not tested here.
- a POSIX daemon host (Linux/macOS), with Node.js 22.x from 22.18, or Node.js 23.6+
  (native TypeScript stripping)
- the CLI of each provider family you use (Codex, Pi, Devin, Claude, OpenCode, Antigravity, Grok),
  signed in on the daemon host; Pi needs repeatable `--append-system-prompt` support
- Antigravity needs agy 1.4.4 or newer; standalone CLI installation retains the other six families

Any one supported provider CLI is sufficient. Available CLIs are discovered before activation.

```bash
paseo plugin install git:AlexTrott/paseo-slp-plugin:plugin              # follow the default branch
paseo plugin install git:AlexTrott/paseo-slp-plugin:plugin --ref <tag>  # or pin a release
```

Check it with `paseo plugin ls`; `slp-revibed` should reach `running`. Installing changes no agent
configuration until you activate it.

### Installing from a local checkout

Use this to run your own clone, for example while changing the plugin.

```bash
git clone https://github.com/AlexTrott/paseo-slp-plugin.git
cd paseo-slp-plugin/plugin
npm install --omit=dev                      # Paseo does not run this step for a directory install
paseo daemon config set pluginsEnabled true # once per daemon, if plugins are not enabled yet
paseo plugin install "$(pwd)"               # the plugin/ directory, as an absolute path
paseo plugin ls                             # slp-revibed should reach running
```

Paseo loads the plugin straight from that directory, so keep the checkout where it is. If the
plugin does not reach `running`, `paseo plugin logs slp-revibed` shows why. Then continue with
[First run](#first-run).

## First run

1. **Open SLP** in Paseo's sidebar (or *Open SLP Overview* from the command palette).
   Available provider CLIs are discovered automatically; any one supported family is sufficient.
   You can configure profiles before activation, without opening Maintenance.
2. **Choose profiles and activate.** In **Profiles**, choose a provider and an explicit model for
   **Supervisor** and **Lead**, plus mode, thinking and features where offered. Choose
   **Save profiles**, then confirm the daemon home and exclusive configuration window when
   prompted. Saving applies the choices and activates the plugin. Keep other configuration writers
   out while it runs. Models must be set before delegation; Devin uses `swe-2` models. Changes
   affect future launches, not sessions already running. Maintenance remains available for
   updates, recovery and executable overrides.
3. **Onboard a repository.** Install the onboarding skill, then ask any agent in that repo to
   *onboard / set up SLP*. It proposes `.paseo-slp/workspace-protocol.md` and the Peer pool,
   and shows the full diff before writing.

   ```bash
   npx skills add AlexTrott/paseo-slp-plugin --skill slp-revibed-onboarding
   ```

4. **Make the Peer pool ready.** If the repo inherits the shared pool, use **Peer pool** to
   add suitable options with provider, model and available settings, enable them and **Save**.
   If onboarding pins `.paseo-slp/slp-routing.json`, configure that file's options during
   onboarding. The settings screen edits the shared pool; a repo pin takes precedence, and an
   empty or invalid pin does not fall back to it.
5. **Hand over a task.** Choose **New agent** in the repo's workspace, then the **SLP Lead**
   profile, and give it the title `Lead — <task>` and a bounded objective. If you prefer to work
   through a Supervisor, choose **SLP Supervisor** and the title `Supervisor — <task>` instead.
   Then keep chatting there.

A few optional lines make an objective more robust:

| Line               | Use it when                                                                        |
| ------------------ | ---------------------------------------------------------------------------------- |
| `Repository: …`    | The session's workspace may not be the target, or the task spans repositories      |
| `Report back …`    | Always: it marks a bounded assignment with a deliverable, not an open conversation |
| `Heartbeat: …`     | Long work, e.g. `Heartbeat: sweep every 30m until handback`                         |

No skills installed? Paste this into any agent: *"Help me set up SLP Revibed. Read
https://raw.githubusercontent.com/AlexTrott/paseo-slp-plugin/main/docs/agent-guide.md first, then
walk me through it step by step."*

## Work records and review

Open **Read SLP work** from the workspace command palette to see assignments registered in
that repository's desk. The **SLP work** panel shows the current brief, decision history,
declared owners and dependencies, review observations, and candidate/check evidence. Use
**Reload** for fresh state; missing or older records are shown explicitly. It does not infer
work from chats or accept a task for you.

For a large objective, the **Tasks** section shows the native queue, readiness reasons,
attempts, current result judgments and unresolved delivery/resource obligations. The Lead
invokes dispatch explicitly: reserve first, create without a work prompt, bind the registered
worker's scope, then send work. Dependencies require qualified output judgments and measured
availability. Integration stages and checks the combined candidate before applying a bounded
delta to the target; conflicts and uncertain effects stay recorded for reconciliation.
See [native task execution](docs/task-execution.md) for the sequence and operational limits.

Assignment handoff keeps the same work ID and history: the current Lead offers it to an
exact receiving Lead membership, which acknowledges responsibility under revision checks.
See [assignment continuity](docs/work-continuity.md) for the sequence and its limits, and
[work coordination](docs/work-coordination.md) for the desk tools and report contract.

External trackers and project-specific automation belong to your workspace. The plugin
uses its own desk and adds no tracker integration.

## Optional settings

Both are **off by default**; quota fallback belongs to the selected Peer pool, including a
repo-pinned pool.

| Setting                                                         | What it adds                                                                                     |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [Communication language](docs/operations.md#getting-started)    | Instructs managed seats to use one language with each other; replies to you follow your language |
| [Peer quota fallback](docs/operations.md#peer-quota-fallback)   | One designated pool option the Lead may retry on once when a Peer runs out of quota              |

## Updating and removal

```bash
paseo plugin update slp-revibed               # git source on the default branch
paseo plugin update slp-revibed --ref <tag>   # pinned: choose the new ref explicitly
paseo plugin reload slp-revibed               # directory install: after the checkout changes
```

For a local checkout, pull the new code, refresh the dependencies and reload:

```bash
cd /path/to/paseo-slp-plugin
git pull
(cd plugin && npm install --omit=dev)
paseo plugin reload slp-revibed
```

After an update or reload, open the settings screen and run **Update SLP runtime** when it offers
the new runtime. Running sessions keep their existing process and role instructions; new launches
use the new binding. Managed session opens still require the plugin to be running.

To remove it, choose **Deactivate** in **Maintenance** first (this removes the providers and
profiles and keeps the runtime files for sessions still running), then run
`paseo plugin remove slp-revibed`. Details are in [docs/operations.md](docs/operations.md#upgrading).

If the settings screen reports a configuration conflict or `RECOVERY_REQUIRED`, use
**Reconcile → inspect** and resolve the reported entries before retrying.

## Coming from paseo-slp

The plugin id changed from `paseo-slp` to `slp-revibed`, so Paseo treats this as a different
plugin. Both own the same `slp-*` providers and profiles and must not run side by side.

1. With no SLP agents running, open the old plugin's **Maintenance** and choose **Deactivate**.
2. `paseo plugin remove paseo-slp`
3. Install SLP Revibed as above and activate it from **Profiles**.

Your saved role choices and the shared Peer pool live under `<daemonHome>/slp-runtime/state/` and
are picked up again. Repositories need no change: `.paseo-slp/` is read as before.

Two things do not carry over:

- **Jev routing and communication supervision are gone.** A runtime pin that carries a routing
  decision is refused; Peers are chosen by the Lead. Their old settings files are left on disk
  and unused. `jev-*.key` there holds your Jev API key, so delete it, along with `jev.json` and
  `supervision*.json`, from `<daemonHome>/slp-runtime/state/`.
- **Stuck after upgrading Paseo with the old plugin?** If the old plugin left an activation in
  `RECOVERY_REQUIRED` on Paseo 0.16 or later, install SLP Revibed without deactivating and use
  **Reconcile → complete**; see [docs/operations.md](docs/operations.md#activation).

## Development

From a source checkout, install dependencies with `npm ci`, then run the local checks:

```bash
npm test                          # runs in a temporary, isolated PASEO_HOME
npm run typecheck
npm run check                     # inspect the install-unit identity
npm run check:plugin-payload      # verify the generated payload is current
```

CI runs on Node 24. After changing install-unit sources (`package.json`, `install.sh`, `bin/`,
`skills/`, `src/`, `plugin/server/runtime/` or `plugin/shared/runtime/`), run
`npm run generate:plugin-payload`, then repeat the payload check. Local checks establish source
behavior and payload freshness; see [docs/development.md](docs/development.md) for host-parity
runs against a real Paseo install and the live E2E harness.

The overview SVG comes from `scripts/generate-readme-diagrams.mjs`; after editing it, run
`node scripts/generate-readme-diagrams.mjs` (`--check` verifies the SVG).

## Docs

| Read                                             | When you want                                                                   |
| ------------------------------------------------ | ------------------------------------------------------------------------------- |
| [docs/architecture.md](docs/architecture.md)     | The role model, what the plugin adds to Paseo, role delivery and delegation     |
| [docs/operations.md](docs/operations.md)         | Activation, upgrades, profiles, repository setup, the Peer pool                 |
| [docs/cli.md](docs/cli.md)                       | The offline `slp.mjs` commands: `prepare`, `routes`, `route-choices`, `monitor` and the rest |
| [docs/work-coordination.md](docs/work-coordination.md) | Durable briefs, decisions, review mandates, reports and the read-only workspace panel |
| [docs/work-continuity.md](docs/work-continuity.md) | Planned owner handoff, acknowledgment, historical authority and remaining obligations |
| [docs/task-execution.md](docs/task-execution.md) | Native task queue, supervised dispatch, dependency proof, integration and reconciliation |
| [docs/contract.md](docs/contract.md)             | What every file owns, before you change it                                      |
| [docs/development.md](docs/development.md)       | Tests, verification status and the E2E harness                                  |
| [docs/decisions/](docs/decisions/)               | Durable decisions, one file each: what was decided, by whom and why             |
| [AGENTS.md](AGENTS.md)                           | The rules contributors and agents follow in this repository                     |

Technical contracts for individual capabilities live under [docs/spec/](docs/spec/).

## License

MIT, see [LICENSE](LICENSE). SLP Revibed is a fork of paseo-slp; the original copyright notice
is retained.
