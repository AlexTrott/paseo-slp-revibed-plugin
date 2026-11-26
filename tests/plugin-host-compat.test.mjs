// Host-version seams: one behavior across Paseo hosts that differ in profile
// option keys, create-hook option keys, hook registration and turn payloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assertRawLiveAgreement, canonicalProfile, canonicalProjection, canonicalSha256, effectiveView,
  profilesArray, profilesForPatch, profilesHashOf, unrelatedPersistedView,
} from '../plugin/server/config-view.ts';
import { classifyState } from '../plugin/server/config-transaction.ts';
import { OWNED_PROVIDER_IDS } from '../plugin/shared/runtime/families.ts';
import { lifecycleHooks } from '../plugin/server/lifecycle-hooks.ts';
import { createRoleInjection } from '../plugin/server/role-injection.ts';
import { DESK_TASK_CREATE_TICKET_KEY } from '../plugin/server/desk-seat.ts';
import { readTurnHistory } from '../plugin/server/turn-history.ts';
import { verifySeat } from '../plugin/server/desk-seat-observation.ts';
import { agentProfiles, readableProfile } from '../plugin/server/runtime/cli/host-config.ts';

const base = { id: 'slp-lead', name: 'SLP Lead', provider: 'slp-codex-lead' };

test('a saved profile has one canonical options form across host vocabularies', () => {
  const legacy = { ...base, featureValues: { auto_accept: true } };
  const stored017 = { ...base, options: { auto_accept: true } };
  const served017 = { ...base, options: { auto_accept: true }, featureValues: { auto_accept: true } };
  for (const entry of [legacy, stored017, served017]) assert.deepEqual(canonicalProfile(entry), legacy);
  assert.deepEqual(canonicalProfile({ ...base, featureValues: { a: 1, b: 1 }, options: { b: 2 } }),
    { ...base, featureValues: { a: 1, b: 2 } }, 'options win over a stale featureValues key, as on the host');
  for (const empty of [{ ...base, featureValues: {} }, { ...base, options: {} }, { ...base, options: {}, featureValues: {} }]) {
    assert.deepEqual(canonicalProfile(empty), base, 'no values is the absent key: 0.16+ hosts drop an empty record');
  }
  assert.equal(canonicalProfile(base), base, 'a profile without either key is returned untouched');
  const malformed = { ...base, featureValues: 'x' };
  assert.equal(canonicalProfile(malformed), malformed, 'a malformed value stays visible to schema validation');
  assert.equal(canonicalProfile(null), null);
});

test('raw and live reads canonicalize profiles and report the host vocabulary', () => {
  const raw = { daemon: { agentProfiles: [{ ...base, options: { x: 1 } }, { id: 'other', name: 'O', provider: 'codex', featureValues: {} }] } };
  const read = profilesArray(raw);
  assert.deepEqual(read.value, [{ ...base, featureValues: { x: 1 } }, { id: 'other', name: 'O', provider: 'codex' }]);
  assert.equal(read.usesOptionsKey, true);
  assert.equal(profilesArray({ daemon: { agentProfiles: [{ ...base, featureValues: { x: 1 } }] } }).usesOptionsKey, false);
  const live = effectiveView({ agentProfiles: [{ ...base, options: { x: 1 }, featureValues: { x: 1 } }] });
  assert.deepEqual(live.agentProfiles.value, [{ ...base, featureValues: { x: 1 } }]);
  assert.equal(live.profilesUseOptionsKey, true);
  assert.equal(effectiveView({ agentProfiles: [base] }).profilesUseOptionsKey, false);
  const unrelated = { id: 'mine', name: 'Mine', provider: 'codex' };
  assert.deepEqual(
    unrelatedPersistedView({ daemon: { agentProfiles: [{ ...unrelated, featureValues: { k: true } }] } }),
    unrelatedPersistedView({ daemon: { agentProfiles: [{ ...unrelated, options: { k: true } }] } }),
    'a host rewriting an unrelated profile into its own key is not unrelated drift');
});

test('a legacy receipt projection compares equal to what a 0.16+ host stores', () => {
  const recorded = { providers: {}, profilesPresent: true, injectIntoAgents: { present: true, value: true },
    profiles: [{ index: 0, value: { ...base, featureValues: {} } }] };
  assert.deepEqual(canonicalProjection(recorded).profiles, [{ index: 0, value: base }]);
  assert.deepEqual(recorded.profiles[0].value, { ...base, featureValues: {} }, 'the recorded projection itself is not rewritten');
});

test('config patches carry options only for a host that already uses the key', () => {
  const desired = [{ ...base, featureValues: { keep: true } }, base];
  assert.deepEqual(profilesForPatch(desired, false), desired, 'older hosts keep receiving featureValues alone');
  assert.deepEqual(profilesForPatch(desired, true), [
    { ...base, featureValues: { keep: true }, options: { keep: true } },
    { ...base, options: {} },
  ], 'an explicit options record replaces the stored one, so a removed key cannot survive');
});

test('a profile divergence on a 0.16+ host names the startup-migration remedy', () => {
  const raw = { daemon: { agentProfiles: [{ ...base, featureValues: { fast_mode: true } }] } };
  const migrated = effectiveView({ mcp: { enabled: true }, agentProfiles: [
    { ...base, options: { service_tier: 'fast' }, featureValues: { service_tier: 'fast' } }] });
  assert.throws(() => assertRawLiveAgreement(raw, migrated), error => {
    assert.equal(error.code, 'RAW_LIVE_DIVERGENCE');
    assert.match(error.message, /daemon\.agentProfiles/);
    assert.match(error.message, /re-save that profile in Paseo settings/);
    return true;
  });
  const older = effectiveView({ mcp: { enabled: true }, agentProfiles: [{ ...base, featureValues: { other: true } }] });
  assert.throws(() => assertRawLiveAgreement(raw, older), error => !/re-save that profile/.test(error.message));
  assert.doesNotThrow(() => assertRawLiveAgreement(
    { daemon: { agentProfiles: [{ ...base, featureValues: { x: 1 } }] } },
    effectiveView({ mcp: { enabled: true }, agentProfiles: [{ ...base, options: { x: 1 }, featureValues: { x: 1 } }] })),
  'a file not yet rewritten by a 0.16+ host agrees with what that host serves');
});

test('lifecycle hooks register through addHook when the host offers it, else the legacy pair', () => {
  const calls = [];
  const off = () => {};
  const handler = () => {};
  const modern = lifecycleHooks({
    addHook: (name, fn) => { calls.push(['addHook', name, fn]); return off; },
    on: () => assert.fail('legacy on must not be used beside addHook'),
    before: () => assert.fail('legacy before must not be used beside addHook'),
  });
  assert.equal(modern.on('agent.turn_ended', handler), off);
  modern.on('agent.created', handler); modern.on('agent.archived', handler); modern.on('agent.turn_started', handler);
  modern.before('agent.create', handler); modern.before('agent.session_open', handler);
  assert.deepEqual(calls.map(([kind, name]) => [kind, name]), [
    ['addHook', 'agent.turn.after'], ['addHook', 'agent.create.after'], ['addHook', 'agent.archive.after'],
    ['addHook', 'agent.turn.before'], ['addHook', 'agent.create.before'], ['addHook', 'agent.open.before'],
  ]);
  assert.ok(calls.every(([, , fn]) => fn === handler), 'handlers pass through unwrapped: payloads are identical');

  calls.length = 0;
  const legacy = lifecycleHooks({
    on: (name, fn) => { calls.push(['on', name, fn]); return off; },
    before: (name, fn) => { calls.push(['before', name, fn]); return off; },
  });
  legacy.on('agent.turn_ended', handler); legacy.before('agent.create', handler);
  assert.deepEqual(calls, [['on', 'agent.turn_ended', handler], ['before', 'agent.create', handler]]);
  assert.throws(() => lifecycleHooks({}).on('agent.created', handler), /neither addHook nor the legacy on/);
});

test('a turn-ended payload without a timeline key reads history instead of throwing', async () => {
  const event = { agent: { id: 'peer', provider: 'slp-codex-peer', parentAgentId: 'lead', workspaceId: null, cwd: '/tmp', title: null,
    background: false, metadata: {} }, turnId: 'ended', outcome: { kind: 'completed' } };
  const page = { agentId: 'peer', entries: [{ turnId: 'ended', item: { type: 'user_message', text: 'brief' } }],
    hasOlder: false, hasNewer: false, error: null, reset: false, staleCursor: false, gap: false };
  const observed = await readTurnHistory(event, { agents: { ref: () => ({ timeline: { refetch: async () => page } }) } });
  assert.deepEqual(observed.timeline.map(item => item.text), ['brief']);
});

function injectionWithMint(t, mints) {
  const runtimePath = mkdtempSync(join(tmpdir(), 'slp-host-compat-'));
  t.after(() => rmSync(runtimePath, { recursive: true, force: true }));
  mkdirSync(join(runtimePath, 'plugin/server/runtime/cli'), { recursive: true });
  writeFileSync(join(runtimePath, 'plugin/server/runtime/cli/role-bundle.ts'), '// role bundle fixture\n');
  writeFileSync(join(runtimePath, 'installed.json'), JSON.stringify({ candidate: { files: [{ path: 'plugin/server/runtime/cli/role-bundle.ts' }] } }));
  return createRoleInjection({
    readActiveBinding: () => ({ candidateSha256: 'a'.repeat(64), payloadSha256: 'b'.repeat(64),
      runtimePath, nodePath: process.execPath, daemonHome: join(runtimePath, 'home') }),
    verifyCandidate: () => {},
    importModule: async () => ({ roleBundle: (_root, role) => ({ role, instructions: `role ${role}` }) }),
    deskMint: async input => { mints.push(input); return { handle: 'h'.repeat(64) }; },
  });
}

test('create hooks read composer options from providerOptions as well as featureValues', async t => {
  const mints = [];
  const injection = injectionWithMint(t, mints);
  // 0.16+ without the compatibility copy: only providerOptions carries the marker.
  const out = await injection.agentCreate({ request: { config: { provider: 'slp-codex', cwd: '/work', providerOptions: { slp_role: 'lead' } } } });
  assert.equal(out.config.systemPrompt, 'role lead');
  const legacy = await injection.agentCreate({ request: { config: { provider: 'slp-codex', cwd: '/work', featureValues: { slp_role: 'peer' } } } });
  assert.equal(legacy.config.systemPrompt, 'role peer');
  await assert.rejects(injection.agentCreate({ request: { config: { provider: 'slp-codex', cwd: '/work', providerOptions: {} } } }), /cannot resolve a role/);
});

test('the task create ticket observes one options record whichever key the host fills', async t => {
  const ticket = 'f'.repeat(64);
  const observed = async config => {
    const mints = [];
    await injectionWithMint(t, mints).agentCreate({ request: {
      config: { provider: 'slp-codex-peer', cwd: '/work', ...config }, env: { [DESK_TASK_CREATE_TICKET_KEY]: ticket } } });
    return mints[0].taskCreateTicketContext.config.featureValues;
  };
  assert.deepEqual(await observed({ featureValues: { bounded: true } }), { bounded: true }, '0.15 and earlier');
  assert.deepEqual(await observed({ featureValues: { bounded: true }, providerOptions: { bounded: true } }), { bounded: true }, '0.16+ with the compatibility copy');
  assert.deepEqual(await observed({ providerOptions: { bounded: true } }), { bounded: true }, 'after the compatibility copy is removed');
  for (const none of [{}, { featureValues: {} }, { providerOptions: {} }]) {
    assert.equal(await observed(none), null, 'no options is null: 0.16+ drops an empty record before the hook');
  }
});

test('seat verification accepts the applied options record a 0.16+ host reports', async () => {
  const pin = { provider: 'slp-codex-peer', model: 'model', cwd: '/repo', workspaceId: 'w', parent: 'lead',
    features: { sandbox_mode: 'workspace-write', fast: true }, labels: {} };
  const agent = over => ({ id: 'peer', provider: pin.provider, model: pin.model, cwd: pin.cwd, workspaceId: 'w', archivedAt: null,
    labels: { 'paseo.parent-agent-id': 'lead' }, ...over });
  const check = async over => (await verifySeat({ agents: { ref: () => ({ refresh: async () => ({ agent: agent(over), project: null }) }) } }, 'peer', pin)).mismatches;
  // The legacy projection lists only options with a composer control.
  assert.deepEqual(await check({ features: [{ id: 'fast', value: true }], options: { sandbox_mode: 'workspace-write', fast: true } }), []);
  assert.deepEqual(await check({ features: [], options: { sandbox_mode: 'read-only', fast: true } }), ['feature:sandbox_mode:read-only']);
  assert.deepEqual(await check({ options: { fast: true } }), ['feature:sandbox_mode:absent']);
  assert.deepEqual(await check({ features: [{ id: 'fast', value: true }, { id: 'sandbox_mode', value: 'workspace-write' }] }), [], 'older hosts report features only');
  assert.deepEqual(await check({}), ['features:unreported']);
});

test('the offline CLI reads saved profile values from either host key', () => {
  const stored = { ...base, options: { auto_accept: true } };
  assert.deepEqual(readableProfile(stored), { ...base, featureValues: { auto_accept: true } });
  assert.deepEqual(agentProfiles({ version: 1, daemon: { agentProfiles: [stored, base] } }),
    [{ ...base, featureValues: { auto_accept: true } }, base]);
  assert.equal(readableProfile(base), base);
});

test('a plan recorded in the legacy profile shape classifies as reached on a 0.16+ host, and only then', () => {
  const supervisor = { id: 'slp-supervisor', name: 'SLP Supervisor', provider: 'slp-codex-supervisor' };
  const lead = { ...base, model: 'm' };
  // What an earlier plugin version recorded: featureValues, including an empty record.
  const recordedSlots = [
    { index: 0, value: { ...supervisor, featureValues: {} } },
    { index: 1, value: { ...lead, featureValues: { auto_accept: true } } },
  ];
  const absent = Object.fromEntries(OWNED_PROVIDER_IDS.map(id => [id, { present: false }]));
  const disk = profiles => ({ version: 1, daemon: { mcp: { enabled: true, injectIntoAgents: true }, agentProfiles: profiles } });
  const served = profiles => ({ mcp: { enabled: true, injectIntoAgents: true }, providers: {}, agentProfiles: profiles });
  const stored = [supervisor, { ...lead, options: { auto_accept: true } }];
  const wire = [supervisor, { ...lead, options: { auto_accept: true }, featureValues: { auto_accept: true } }];
  const plan = {
    before: { owned: { providers: absent, profilesPresent: false, profiles: [], injectIntoAgents: { present: false } },
      allProfilesSha256: profilesHashOf(false, []), effectiveEnabled: true,
      unrelatedPersistedSha256: canonicalSha256(unrelatedPersistedView(disk(stored))) },
    afterOwned: { providers: absent, profilesPresent: true, profiles: recordedSlots, injectIntoAgents: { present: true, value: true } },
    afterAllProfilesSha256: profilesHashOf(true, recordedSlots.map(slot => slot.value)),
  };
  assert.deepEqual(classifyState(disk(stored), served(wire), plan), { class: 'after', problems: [], endpointsEqual: false });

  const changed = [supervisor, { ...lead, options: { auto_accept: false } }];
  assert.notEqual(classifyState(disk(changed), served(changed), plan).class, 'after', 'a changed owned value is never admitted');
  const foreign = { id: 'mine', name: 'Mine', provider: 'codex' };
  assert.notEqual(classifyState(disk([...stored, foreign]), served([...wire, foreign]), plan).class, 'after',
    'the recorded hash still binds every unrelated entry');
  assert.notEqual(classifyState(disk([stored[1], stored[0]]), served([wire[1], wire[0]]), plan).class, 'after', 'and the order');
});
