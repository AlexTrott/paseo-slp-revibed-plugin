// Management surface for the slp-revibed plugin (spec §2, §10).
// PluginScreenProps carry host.id/host.label only — the daemon home is
// administrator input, never a prop. Profiles Save explicitly chains save then activation; opening the UI
// never activates; runtime starts require the two §4 authority acknowledgments. Status is
// fetched on demand, then polled every second only while an operation pends.
//
// Overview presents runtime identity and configuration summaries. Sections
// share one host session; drafts remain mounted while sections change.
// Target paths and authority acknowledgments never enter screen params.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRpc } from "@getpaseo/plugin/client";
import { Modal } from "@getpaseo/plugin/client/react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { activate, catalog, deactivate, reconcile, status, localTarget, setLanguage, getRoleRouting, setRoleRouting, getPeerPool, setPeerPool } from "../shared/contracts.ts";
import { FAMILY_IDS, FAMILY_LABEL, FAMILY_PICKER_ORDER } from "../shared/runtime/families.ts";
import type { RoleName } from "../shared/runtime/families.ts";
import { PEER_SEAT_ARCHETYPES } from "../shared/archetypes.ts";
import {
  HOW_TO_READ,
  STANDARD_SEAT_TOKENS,
  SUITABILITY_AXES,
  SUITABILITY_TOKENS,
  tokenDefinition,
} from "../shared/runtime/routing-vocabulary.ts";
import type { CatalogOptionValue, CatalogResult, FamilyName, StartResult, StatusResult, TargetValue } from "../shared/contracts.ts";
import {
  DISABLE_REMOVE_NOTICE,
  EXCLUSIVE_WINDOW_NOTICE,
  RESTORATION_NOTICE,
  RETAINED_RUNTIME_NOTICE,
  STATUS_POLL_MS,
  activationLabel,
  applyPatch,
  catalogScope,
  conflictLines,
  createTargetViews,
  customSeatIdError,
  emptyTargetView,
  errorMessage,
  familyHint,
  formSeatConflict,
  isDaemonHome,
  lineList,
  newOperationId,
  operationPending,
  operationRows,
  pollDelayAfterStatus,
  reconcileProblem,
  seatManagement,
  startPatch,
  stateHint,
  statusRows,
  targetKey,
  recoverPendingStart,
  thinkingOptionsFor,
  visibleConflicts,
} from "./manager-state.ts";
import type { ReconcileAction, TargetView } from "./manager-state.ts";
import {
  Badge,
  Button,
  Card,
  CheckRow,
  ChipSelect,
  Collapse,
  Field,
  KV,
  LanguageCard,
  OptionPicker,
  SeatTemplateRow,
  StatePill,
  SwitchRow,
  focusRing,
  styles,
} from "./ui-kit.tsx";
import type { Colors, ControlState } from "./ui-kit.tsx";
import { SettingsSelect } from "@getpaseo/plugin/client/ui";
import { readDisplaySnapshot, rememberRead, useTargetLifetime } from "./target-async.ts";
import { useCatalogCache, useCatalogDemand } from "./catalog-demand.ts";
import { useLanguageCard } from "./cards/language.ts";
import { useRoutingCard, RoutingCard } from "./cards/routing.tsx";
import { usePeerPoolCard, PeerPoolCard } from "./cards/peer-pool.tsx";

// Family knowledge derives from the shared registry (shared/runtime/families.ts):
// FAMILY_IDS is the canonical order, FAMILY_PICKER_ORDER the picker order
// (registry pickerRank), FAMILY_LABEL the display names — no local literals.
const AUTHORITY = { exclusiveAdministrativeWindow: true, verifiedHostHomeMapping: true } as const;

import { MANAGER_SECTIONS, managerSection } from "./manager-navigation.ts";
import type { ManagerSectionId } from "./manager-navigation.ts";
import { RuntimeIdentity } from "./runtime-overview.tsx";
import { ConflictBanner, ROLE_GUIDE, RoleGuideCard, SetupChecklist, friendlyState } from "./guide.tsx";
import type { SetupStep } from "./guide.tsx";

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

/** Status rows that are audit/debug metadata — rendered inside the collapsed
 *  "Details" section so the card stays scannable. Everything else (state,
 *  canonical home, candidates, binding) stays visible: spec §4 requires the
 *  home and candidate to be shown before any mutation. */
const STATUS_DETAIL_LABELS = new Set([
  "Runtime",
  "Node",
  "Launch set",
  "Payload",
  "Baseline",
  "Retained runtimes",
  "Last verified",
  "Live acceptance",
]);

type ManagerProps = PluginScreenProps & { onSectionChange?: (section: ManagerSectionId) => void };
export function ManagerSurface(props: ManagerProps) {
  // A host switch owns a new session: no detected home, authority checkbox,
  // draft, busy flag or late completion crosses the host boundary.
  return <ManagerSession key={props.host.id} {...props} />;
}

function ManagerSession({ host, layout, theme, navigation, params = {}, onSectionChange }: ManagerProps) {
  const colors = theme.colors;
  const compact = layout.compact;
  const callStatus = useRpc(status);
  const callActivate = useRpc(activate);
  const callReconcile = useRpc(reconcile);
  const callDeactivate = useRpc(deactivate);
  const callLocalTarget = useRpc(localTarget);
  const callCatalog = useRpc(catalog);
  const callSetLanguage = useRpc(setLanguage);
  const callGetRoleRouting = useRpc(getRoleRouting);
  const callSetRoleRouting = useRpc(setRoleRouting);
  const callGetPeerPool = useRpc(getPeerPool);
  const callSetPeerPool = useRpc(setPeerPool);

  const [detectedHome, setDetectedHome] = useState<string | null>(() => readDisplaySnapshot<string>(`home:${host.id}`));
  const [homeOverride, setHomeOverride] = useState("");
  const [exclusiveWindow, setExclusiveWindow] = useState(false);
  const [mappingConfirmed, setMappingConfirmed] = useState(false);
  const [saveConfirmationOpen, setSaveConfirmationOpen] = useState(false);
  const [saveApplyBusy, setSaveApplyBusy] = useState(false);
  const saveApplyRun = useRef<symbol | null>(null);
  const [adoptIdentical, setAdoptIdentical] = useState(false);
  const [nodePath, setNodePath] = useState("");
  const [binaries, setBinaries] = useState<Record<FamilyName, string>>(
    () => Object.fromEntries(FAMILY_IDS.map(family => [family, ""])) as Record<FamilyName, string>,
  );
  const [reconcileAction, setReconcileAction] = useState<ReconcileAction>("inspect");
  const [interruptedId, setInterruptedId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMaintenance, setShowMaintenance] = useState(false);
  const [statusDetailsOpen, setStatusDetailsOpen] = useState(false);
  const [conflictDetailsOpen, setConflictDetailsOpen] = useState(false);

  // In-surface section tabs (mockup sidebar → tab strip): a press switches
  // the active section — inactive sections stay mounted under display:none
  // so drafts and card-local state survive, but never lay out or scroll
  // into view.
  const [localSection, setLocalSection] = useState<ManagerSectionId>(() => managerSection(params));
  const activeSection = onSectionChange ? managerSection(params) : localSection;
  const setActiveSection = (section: ManagerSectionId) => {
    setLocalSection(section);
    onSectionChange?.(section);
  };
  useEffect(() => { setLocalSection(managerSection(params)); }, [params.section]);
  const sectionShown = (id: ManagerSectionId) => (activeSection === id ? null : { display: "none" as const });
  // Role profiles: the mockup's two-column .profile-grid, measured on the
  // card body container (never the window) — two panels ≥700px, else stacked.
  const [profilePanelWide, setProfilePanelWide] = useState(false);
  const scrollFocusNode = (node: unknown, focus = false) => {
    const dom = node as { scrollIntoView?: (options?: { block?: string }) => void; focus?: () => void } | null;
    dom?.scrollIntoView?.({ block: "nearest" });
    if (focus) dom?.focus?.();
  };
  const [store] = useState(createTargetViews);
  const [statusFresh, setStatusFresh] = useState(false);
  const [view, setView] = useState<TargetView>(emptyTargetView);

  const home = homeOverride.trim() !== "" ? homeOverride.trim() : (detectedHome ?? "");
  const target: TargetValue | null = isDaemonHome(home) ? { hostId: host.id, daemonHome: home } : null;
  const key = target ? targetKey(target) : null;
  const keyRef = useRef<string | null>(key);
  const captureTarget = useTargetLifetime(key);
  const statusSequence = useRef(0);
  // Retain the frozen request until its start/uncertainty is resolved. This is not
  // authority: explicit retry also requires fresh target/candidate + acknowledgments.
  const operationRequests = useRef(new Map<string, { operationId: string; invoke: () => Promise<StartResult>; candidate: string; canonicalHome: string }>());
  const autoLoadedFor = useRef<string | null>(null);

  // Prefill the daemon home from the plugin process's own environment
  // (PASEO_HOME else ~/.paseo). A suggestion only — the §4 mapping
  // acknowledgment remains a human decision, and Advanced can override it.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const detected = await callLocalTarget({ schemaVersion: 1 });
        if (!cancelled) { rememberRead(`home:${host.id}`, detected.daemonHome); setDetectedHome(detected.daemonHome); }
      } catch { /* detection unavailable — the field stays empty for manual input */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Two-host isolation: each (hostId, daemonHome) keeps its own view state in
  // the store; switching the target swaps in that target's snapshot.
  useLayoutEffect(() => {
    keyRef.current = key;
    autoLoadedFor.current = null;
    const previous = target ? store.get(target) : undefined;
    const retained = key ? readDisplaySnapshot<StatusResult>(`status:${key}`) : null;
    // Leaving a target does not cancel its start invocation. Restore its busy
    // owner as well as its ID until a response or exact terminal read settles it.
    const restored = previous ?? { ...emptyTargetView(), status: retained };
    setStatusFresh(false);
    if (target) store.set(target, restored);
    setView(restored);
    setExclusiveWindow(false);
    setMappingConfirmed(false);
    setSaveConfirmationOpen(false);
    setSaveApplyBusy(false);
    saveApplyRun.current = null;
    setAdoptIdentical(false);
    setNodePath("");
    setBinaries(Object.fromEntries(FAMILY_IDS.map(family => [family, ""])) as Record<FamilyName, string>);
    setInterruptedId("");
    setReconcileAction("inspect");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures target
  }, [key]);

  // Bind every patch to the target the request was issued for: a late RPC
  // updates that target's stored view but repaints only while it is still the
  // displayed target — never old-target data over the new target's view.
  const update = useCallback((patch: Partial<TargetView>, forTarget: TargetValue) => {
    const { view, repaint } = applyPatch(store, forTarget, patch, keyRef.current);
    if (repaint) setView(view);
  }, [store]);

  const refresh = useCallback(async (forTarget: TargetValue, operationId?: string): Promise<StatusResult | null> => {
    const ticket = captureTarget();
    if (!ticket.isCurrent() || keyRef.current !== targetKey(forTarget)) return null;
    const issued = ++statusSequence.current;
    setStatusFresh(false);
    update({ lastError: null }, forTarget);
    try {
      const next = await callStatus({ schemaVersion: 1, target: forTarget, ...(operationId ? { operationId } : {}) });
      if (!ticket.isCurrent() || issued !== statusSequence.current) return null;
      rememberRead(`status:${targetKey(forTarget)}`, next);
      setStatusFresh(true);
      const tracked = store.get(forTarget)?.pending;
      const observed = operationId && tracked?.operationId === operationId ? next.operation : null;
      if (observed != null && observed.operationId === operationId && !operationPending(observed)) {
        // An exact terminal read supersedes the matching in-flight retry, not
        // only its poll tracker. Retire its callback before releasing busy so
        // late success/error cannot overwrite this result or the next start.
        const request = operationRequests.current.get(targetKey(forTarget));
        const settlesInvocation = request?.operationId === operationId;
        if (settlesInvocation) operationRequests.current.delete(targetKey(forTarget));
        update({ status: next, lastError: null, pending: null,
          ...(settlesInvocation ? { busy: false } : {}),
          notice: `Operation ${operationId} resolved: ${observed.outcome}.` }, forTarget);
      } else if (operationId && tracked?.operationId === operationId && tracked.uncertain) {
        // Only a complete explicit NOT_FOUND observation permits retry of the
        // same frozen request; missing/foreign/error observations do not.
        const retryAllowed = next.operation == null && next.conflicts.some(conflict => conflict.code === "NOT_FOUND");
        update({ status: next, lastError: null, pending: { ...tracked, retryAllowed } }, forTarget);
      } else {
        update({ status: next, lastError: null }, forTarget);
      }
      return next;
    } catch (error) {
      if (ticket.isCurrent() && issued === statusSequence.current) { setStatusFresh(false); update({ lastError: errorMessage(error) }, forTarget); }
      return null;
    }
  }, [callStatus, update, captureTarget, store]);

  // Once a target is known (detected or typed), fetch status automatically —
  // read-only, so no authority acknowledgment is needed to inspect.
  useEffect(() => {
    if (!target || !key || autoLoadedFor.current === key) return;
    autoLoadedFor.current = key;
    void refresh(target, store.get(target)?.pending?.operationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures target
  }, [key, view.status, view.busy]);

  const statusView = view.status;

  const cache = useCatalogCache(target, key, statusView?.operation, callCatalog);
  const { catalogs, featureSets, catalogLoadingFor, featuresLoadingFor, retryCatalog, retryFeatureSet, catalogIsRefreshing, featureIsRefreshing } = cache;

  // Retain the existing card-hook argument contract. Cards now own their
  // async session tickets, while shell patches remain target-bound.
  const sameTarget = (forTarget: TargetValue): boolean => keyRef.current === targetKey(forTarget);
  const isCurrentKey = (issueKey: string): boolean => keyRef.current === issueKey;

  // The language card owns its draft/apply lifecycle (prefill from status
  // until the Human edits, immediate-off toggle) — cards/language.ts.
  const language = useLanguageCard({ target, targetKey: key, isCurrentKey, statusView, statusFresh, callSetLanguage, refresh, update });

  // The routing card owns the stored value, the editable form, its
  // once-per-target load, prefill and save — cards/routing.tsx. `form` and
  // `featureKeys` feed the catalog-demand computation below; the cache module owns their lifecycle.
  const routing = useRoutingCard({
    target,
    targetKey: key,
    isCurrentKey,
    statusView,
    callGetRoleRouting,
    callSetRoleRouting,
    catalogs,
    featureSets,
    featuresLoadingFor,
    update,
  });

  // The peer-pool card owns its snapshot/draft, seat handlers, editor UI
  // state and save/reload/import/copy — cards/peer-pool.tsx. `form` and
  // `featureKeys` declare catalog demand; the scroll helper stays shell-owned.
  const pool = usePeerPoolCard({
    target,
    targetKey: key,
    isCurrentKey,
    callGetPeerPool,
    callSetPeerPool,
    catalogs,
    featureSets,
    featuresLoadingFor,
    catalogIsRefreshing,
    featureIsRefreshing,
    scrollFocusNode,
    update,
  });

  useCatalogDemand(cache, [
    { family: routing.form.supervisor.family, role: "supervisor" },
    { family: routing.form.lead.family, role: "lead" },
    ...pool.poolForm.seats.map(seat => ({ family: seat.family, role: "peer" as const })),
  ], routing.featureKeys.concat(pool.featureKeys));

  // Poll the tracked operation until it reaches a terminal outcome. The first
  // delay is the server's pollAfterMs; later polls run every STATUS_POLL_MS.
  const pending = view.pending;
  useEffect(() => {
    if (!target || !pending) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = (ms: number) => { timer = setTimeout(tick, ms); };
    const tick = async () => {
      const next = await refresh(target, pending.operationId);
      if (cancelled) return;
      if (next == null) { schedule(STATUS_POLL_MS); return; }
      if (!next.operation || next.operation.operationId !== pending.operationId || operationPending(next.operation)) { schedule(pollDelayAfterStatus(next) || STATUS_POLL_MS); return; }
      update({ pending: null, notice: `Operation ${pending.operationId} resolved: ${next.operation.outcome}.` }, target);
    };
    schedule(pending.nextPollMs);
    return () => { cancelled = true; if (timer !== undefined) clearTimeout(timer); };
    // A start reply may replace the provisional delay with pollAfterMs.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- target/operation/delay own the poll lifetime
  }, [key, pending?.operationId, pending?.nextPollMs]);

  const runOperation = useCallback(async (invoke: () => Promise<StartResult>, operationId: string, retryOriginal = false) => {
    const retrying = retryOriginal && view.pending?.operationId === operationId && view.pending.retryAllowed === true;
    if (!statusFresh || !target || view.busy || (!retrying && view.pending) || (view.status?.operation && operationPending(view.status.operation))) return;
    const current = store.get(target);
    if (current?.busy || (current?.pending && !(retrying && current.pending.operationId === operationId && current.pending.retryAllowed))) return;
    const original = operationRequests.current.get(targetKey(target));
    if (original && !(retrying && original.operationId === operationId)) return;
    const ticket = captureTarget();
    if (!ticket.isCurrent()) return;
    operationRequests.current.set(targetKey(target), { operationId, invoke,
      candidate: view.status!.embeddedCandidateSha256, canonicalHome: view.status!.target.daemonHome });
    // Track before awaiting acceptance: a delayed reply is not cancellation,
    // and an empty status read cannot authorize a replacement request.
    update({ busy: true, pending: { operationId, nextPollMs: STATUS_POLL_MS }, lastError: null,
      notice: `Starting operation ${operationId}. Target changes do not cancel server work; inspect this ID before retrying.` }, target);
    const finish = (start: StartResult) => {
      if (operationRequests.current.get(targetKey(target))?.operationId !== operationId) return;
      operationRequests.current.delete(targetKey(target));
      // startPatch keeps start.conflicts visible whether or not the response
      // was accepted — an accepted reconcile inspect can still report drift.
      if (!ticket.isCurrent()) {
        applyPatch(store, target, startPatch(start), null);
        return;
      }
      update(startPatch(start), target);
      void refresh(target, start.operation?.operationId);
    };
    try {
      finish(await invoke());
    } catch (error) {
      // A transport failure says nothing about acceptance. Retain the original
      // ID before probing so a failed/foreign/missing read cannot admit a new
      // mutation. The existing per-target tracker owns subsequent read-only polls.
      const unresolved = {
        busy: false,
        pending: { operationId, nextPollMs: STATUS_POLL_MS, uncertain: true, retryAllowed: false },
        notice: `Operation ${operationId} has an unconfirmed outcome. Inspect this exact ID before retrying; no mutation is retried automatically.`,
        lastError: errorMessage(error),
      };
      if (operationRequests.current.get(targetKey(target))?.operationId !== operationId) return;
      if (!ticket.isCurrent()) {
        const current = store.get(target);
        if (!current?.pending || current.pending.operationId === operationId) applyPatch(store, target, unresolved, null);
        return;
      }
      update(unresolved, target);
      const probe = await refresh(target, operationId);
      if (!ticket.isCurrent() || operationRequests.current.get(targetKey(target))?.operationId !== operationId) return;
      if (probe == null) {
        update({ lastError: `${errorMessage(error)} (status probe failed as well)` }, target);
        return;
      }
      const recovery = recoverPendingStart(operationId, probe);
      if (recovery.kind === "settled") {
        update({ pending: null, notice: `Operation ${operationId} resolved: ${recovery.operation.outcome}.` }, target);
      } else if (recovery.kind === "poll") {
        update({ notice: `Operation ${operationId} was accepted and is still pending — tracking this ID.` }, target);
      } else {
        // Even an absent journal entry does not authorize a replacement ID or
        // an automatic mutation retry. Keep the original ID available to inspect.
        update({ lastError: recovery.kind === "unresolved" ? recovery.message : `Operation ${operationId} is not yet confirmed in the journal; inspect this ID before retrying.` }, target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures target
  }, [key, statusFresh, view.status, view.busy, view.pending, update, callStatus, refresh, captureTarget, store]);

  const retryOriginalOperation = () => {
    if (!target || !key || !statusFresh || !exclusiveWindow || !mappingConfirmed || view.busy || saveApplyBusy || routing.busy || !view.pending?.retryAllowed) return;
    const original = operationRequests.current.get(key);
    if (!original || original.operationId !== view.pending.operationId
      || original.candidate !== statusView?.embeddedCandidateSha256
      || original.canonicalHome !== statusView?.target.daemonHome) return;
    void runOperation(original.invoke, original.operationId, true);
  };
  const original = key ? operationRequests.current.get(key) : undefined;
  const canRetryOriginal = statusFresh && exclusiveWindow && mappingConfirmed && !view.busy && !saveApplyBusy && !routing.busy
    && view.pending?.retryAllowed === true && original?.operationId === view.pending.operationId
    && original?.candidate === statusView?.embeddedCandidateSha256 && original?.canonicalHome === statusView?.target.daemonHome;

  const canMutate = statusFresh && !(statusView?.operation && operationPending(statusView.operation)) && target != null && exclusiveWindow && mappingConfirmed && !view.busy && !view.pending && !saveApplyBusy;
  // Conflicts from the last start response, the tracked operation's own
  // status(opId) results, and the status itself — merged and deduped; an
  // accepted or succeeded operation's conflicts stay visible.
  const conflictList = visibleConflicts(view);

  // The peer-pool family picker offers only families the host reports as
  // available (registry picker order) — a seat's stored family that is no
  // longer available keeps an "(unavailable)" escape-hatch chip.
  const availableFamilies: FamilyName[] = FAMILY_PICKER_ORDER.filter(family =>
    statusView?.families.find(view => view.family === family)?.availability === "available",
  );

  // `initialProfileFamily` and `profiles` stay activate RPC inputs for
  // scripted use — the UI never sends either; the routing card is the
  // single role→provider configurator and applies through activation.
  const activateInput = (): Parameters<typeof callActivate>[0] | { error: string } => {
    if (!target || !statusView) return { error: "No target" };
    return {
      schemaVersion: 1,
      target,
      operationId: newOperationId(),
      authority: AUTHORITY,
      candidateSha256: statusView.embeddedCandidateSha256,
      adoptIdentical,
      ...(nodePath.trim() ? { nodePath: nodePath.trim() } : {}),
      binaries: Object.fromEntries(
        FAMILY_IDS.map(family => [family, binaries[family].trim()] as const).filter(([, path]) => path !== ""),
      ),
    };
  };

  const runActivate = () => {
    if (!canMutate || routing.busy || saveApplyRun.current) return;
    const input = activateInput();
    if ("error" in input) { update({ lastError: input.error }, target!); return; }
    void runOperation(() => callActivate(input), input.operationId);
  };

  const saveAndApplyProfiles = async () => {
    if (profileMetadataPending || !routing.fresh || !target || !statusView?.binding || !canMutate || routing.busy || saveApplyRun.current || !routing.differs) return;
    const input = activateInput();
    if ("error" in input) return;
    const ticket = captureTarget(), run = Symbol("save-apply");
    const canonicalHome = statusView.target.daemonHome;
    saveApplyRun.current = run;
    setSaveApplyBusy(true);
    setSaveConfirmationOpen(false);
    try {
      if (!await routing.save() || !ticket.isCurrent()) return;
      const fresh = await refresh(target);
      if (!ticket.isCurrent()) return;
      const current = store.get(target);
      if (!fresh || fresh.embeddedCandidateSha256 !== input.candidateSha256
        || fresh.target.hostId !== input.target.hostId || fresh.target.daemonHome !== canonicalHome
        || current?.busy || current?.pending || operationPending(fresh.operation)) {
        update({ lastError: "Profiles were saved, but applying needs a fresh unchanged target/runtime. Inspect Maintenance before retrying." }, target);
        return;
      }
      await runOperation(() => callActivate(input), input.operationId);
    } finally {
      if (saveApplyRun.current === run) {
        saveApplyRun.current = null;
        setSaveApplyBusy(false);
      }
    }
  };

  const profileMetadataPending = ["supervisor", "lead"].some(role => {
    const form = routing.form[role as "supervisor" | "lead"];
    return catalogIsRefreshing(catalogScope(form.family, role as RoleName));
  }) || routing.featureKeys.some(key => key != null && featureIsRefreshing(key));
  const requestSaveAndApply = () => {
    if (profileMetadataPending || !statusFresh || !routing.fresh || !target || !statusView?.binding || view.busy || view.pending || routing.busy || saveApplyRun.current || !routing.differs) return;
    if (!exclusiveWindow || !mappingConfirmed || statusView.binding.candidateSha256 !== statusView.embeddedCandidateSha256) setSaveConfirmationOpen(true);
    else void saveAndApplyProfiles();
  };

  const confirmationControls = () => <>
    <CheckRow colors={colors} checked={exclusiveWindow} onToggle={setExclusiveWindow}
      title="Exclusive configuration window" hint="Nothing else is changing Paseo settings right now — not the app, another plugin, the CLI or a manual file edit" />
    <CheckRow colors={colors} checked={mappingConfirmed} onToggle={setMappingConfirmed} disabled={!target}
      title="Daemon home confirmed" hint={target ? `${target.daemonHome} is the Paseo home folder I want SLP to change` : "Detect or configure the daemon home first"} />
    <Text style={[styles.guideBody, { color: colors.foreground }]}>Why the two checks: SLP edits Paseo's shared configuration file, and Paseo cannot lock it. If something else writes at the same moment, one change can be lost.</Text>
    <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{EXCLUSIVE_WINDOW_NOTICE}</Text>
  </>;

  const runReconcile = () => {
    // §4: canonical home + candidate must be displayed before any operation —
    // reconcile is gated on a loaded status like activate/deactivate.
    if (!target || !statusView) return;
    const problem = reconcileProblem(reconcileAction, interruptedId);
    if (problem) { update({ lastError: problem }, target); return; }
    const input: Parameters<typeof callReconcile>[0] = {
      schemaVersion: 1,
      target,
      operationId: newOperationId(),
      authority: AUTHORITY,
      action: reconcileAction,
      ...(reconcileAction !== "inspect" ? { interruptedOperationId: interruptedId.trim() } : {}),
    };
    void runOperation(() => callReconcile(input), input.operationId);
  };

  const runDeactivate = () => {
    const binding = statusView?.binding;
    if (!target || !binding) return;
    const input: Parameters<typeof callDeactivate>[0] = {
      schemaVersion: 1,
      target,
      operationId: newOperationId(),
      authority: AUTHORITY,
      expectedBindingSha256: binding.bindingSha256,
    };
    void runOperation(() => callDeactivate(input), input.operationId);
  };

  const headerSubtitle = `${statusFresh ? "Supervisor, Lead and Peer setup" : view.lastError ? "Could not read SLP status" : statusView ? "Updating saved view" : "Reading SLP status"} on ${host.label}`;
  const friendly = friendlyState(statusView);
  const runtimeOutdated = statusView?.binding != null && statusView.binding.candidateSha256 !== statusView.embeddedCandidateSha256;
  const profileSummary = (role: "supervisor" | "lead"): string => {
    if (!statusView?.binding) return "Not set up yet";
    if (!routing.ready) return "Reading…";
    const form = routing.form[role];
    return `${FAMILY_LABEL[form.family]} · ${form.model || "provider default model"}`;
  };
  const savedPool = pool.poolData?.pool ?? null;
  const enabledSeats = savedPool ? savedPool.options.filter(option => option.enabled).length : 0;
  const poolSummary = savedPool
    ? `${enabledSeats} of ${savedPool.options.length} ${savedPool.options.length === 1 ? "entry" : "entries"} enabled`
    : pool.poolData ? "No pool saved yet" : "Reading…";
  const availableLabels = availableFamilies.map(family => FAMILY_LABEL[family]);
  const profilesDone = statusView?.binding != null && routing.stored && !routing.diverged;
  const setupSteps: SetupStep[] = [
    { id: "providers", title: "Install a coding agent", done: availableFamilies.length > 0,
      detail: !statusView ? "Checking which agent CLIs are installed…" : availableFamilies.length > 0
        ? `Found ${availableLabels.join(", ")}. SLP runs its roles on these.`
        : "No supported agent CLI was found. Install one (for example Claude Code or Codex), then press Refresh." },
    { id: "activate", title: "Turn SLP on", done: statusView?.binding != null,
      detail: statusView?.binding ? "SLP's providers and profiles are installed in Paseo."
        : "Adds the SLP Supervisor and SLP Lead profiles to Paseo. You confirm two safety checks first; nothing else in your configuration is touched.",
      actionLabel: statusView?.binding ? undefined : "Turn SLP on", onAction: () => setActiveSection("maintenance") },
    { id: "profiles", title: "Choose models for Supervisor and Lead", done: profilesDone,
      detail: routing.saved && (saveApplyBusy || view.pending) ? view.pending?.uncertain ? "Saved; Apply outcome unconfirmed" : "Saved; Apply operation in progress"
        : routing.dirty ? "You have unsaved changes — open Profiles and save."
        : profilesDone ? `Supervisor: ${profileSummary("supervisor")}. Lead: ${profileSummary("lead")}.`
        : routing.diverged ? "Your saved choices are not applied yet — open Profiles and save."
        : `${ROLE_GUIDE.lead.tier} for the Lead; ${ROLE_GUIDE.supervisor.tier.toLowerCase()} for the Supervisor.`,
      actionLabel: profilesDone ? "Change" : "Choose models", onAction: () => setActiveSection("profiles") },
    { id: "pool", title: "Give the Lead a pool of Peers", done: enabledSeats > 0,
      detail: pool.poolReadError ? "The Peer pool could not be read — open Peer pool to retry."
        : pool.poolDirty ? "You have unsaved changes — open Peer pool and save."
        : enabledSeats > 0 ? `${poolSummary}. The Lead picks from these for each task.`
        : "Without an enabled Peer the Lead has nobody to delegate to. Start from the five presets and assign a model to each one you want.",
      actionLabel: enabledSeats > 0 ? "Change" : "Set up Peers", onAction: () => setActiveSection("pool") },
  ];
  const setupDone = setupSteps.every(step => step.done);
  return (
    <ScrollView
      style={{ backgroundColor: colors.surface0 }}
      contentContainerStyle={{ padding: compact ? 12 : 24, gap: compact ? 12 : 16, width: "100%", maxWidth: 1120, alignSelf: "center" }}
    >
      <View style={[styles.headerRow, { flexWrap: "wrap", alignItems: "center" }]}>
        <View style={compact ? { width: "100%", gap: 4 } : { flex: 1, minWidth: 200, gap: 4 }}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>SLP Revibed</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" accessibilityLiveRegion="polite"
            accessibilityLabel={headerSubtitle} accessibilityHint={!statusFresh ? "Writes wait for a fresh read." : undefined}
            style={[styles.muted, { color: colors.foregroundMuted }]}>
            {headerSubtitle}
          </Text>
        </View>
        <StatePill colors={colors} state={statusView?.state ?? null} label={friendly.label} />
        <Button
          colors={colors}
          label="Refresh"
          onPress={() => { if (target) void refresh(target, view.pending?.operationId); }}
          disabled={!target || view.busy}
        />
      </View>

      {!home ? <Text style={[styles.mutedSmall, { color: colors.statusWarning }]}>
        Paseo's home folder was not detected — enter it under Maintenance → Advanced.
      </Text> : null}
      {view.lastError && statusView ? <Text style={[styles.mutedSmall, { color: colors.statusWarning }]}>Showing the last status that was read. Press Refresh to check the current state.</Text> : null}
      {view.lastError ? <Text selectable style={[styles.muted, { color: colors.statusDanger }]}>{view.lastError}</Text> : null}
      {view.notice ? <Text selectable style={[styles.muted, { color: colors.foregroundMuted }]}>{view.notice}</Text> : null}
      {view.busy ? <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>Working…</Text> : null}
      {view.pending ? <KV colors={colors} label="Tracked operation" value={view.pending.operationId} /> : null}
      {view.pending?.uncertain && view.pending.retryAllowed ? <View style={{ gap: 6 }}>
        <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>The original ID is not recorded in the latest journal read. Retry sends the identical request with that ID; it does not create a replacement.</Text>
        <Button colors={colors} label="Retry original operation" disabled={!canRetryOriginal} onPress={retryOriginalOperation} />
      </View> : null}
      {statusView && stateHint(statusView.state) ? <Text style={[styles.muted, { color: colors.statusWarning }]}>{stateHint(statusView.state)}</Text> : null}
      <ConflictBanner colors={colors} conflicts={conflictList} technical={conflictLines(conflictList, compact ? 4 : 8)}
        open={conflictDetailsOpen} onToggle={() => setConflictDetailsOpen(open => !open)} onMaintenance={() => setActiveSection("maintenance")} />
      {runtimeOutdated && activeSection !== "maintenance" ? (
        <View style={[styles.banner, { borderColor: colors.statusWarning, backgroundColor: colors.surface1 }]}>
          <Text style={[styles.checkTitle, { color: colors.foreground }]}>An SLP update is ready to apply</Text>
          <Text style={[styles.guideBody, { color: colors.foregroundMuted }]}>
            This plugin is newer than the SLP runtime Paseo is using. Apply it so new agents get the current role policies; running agents are not interrupted.
          </Text>
          <Button colors={colors} label="Review update" onPress={() => setActiveSection("maintenance")} />
        </View>
      ) : null}

      <Modal title="Save and apply profiles" open={saveConfirmationOpen} onOpenChange={setSaveConfirmationOpen}>
        <Modal.Content>
          <View style={{ gap: 12 }}>
            <RuntimeIdentity colors={colors} statusView={statusView} home={home} />
            <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>These choices apply to future launches; existing sessions keep their current runtime.</Text>
            {statusView?.binding && statusView.binding.candidateSha256 !== statusView.embeddedCandidateSha256 ?
              <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>Applying also updates the bound runtime to the version in this plugin.</Text> : null}
            {confirmationControls()}
            <View style={styles.chipRow}>
              <Button colors={colors} label="Cancel" onPress={() => setSaveConfirmationOpen(false)} />
              <Button colors={colors} kind="primary" label="Save and apply" disabled={!canMutate || routing.busy || !routing.differs}
                onPress={() => void saveAndApplyProfiles()} />
            </View>
          </View>
        </Modal.Content>
      </Modal>

      {params.section && !MANAGER_SECTIONS.some(section => section.id === params.section) ?
        <Text style={[styles.mutedSmall, { color: colors.statusWarning }]}>Unknown section. Showing Overview.</Text> : null}
      {compact ? <SettingsSelect label="SLP section" value={activeSection}
        options={MANAGER_SECTIONS.map(section => ({ label: section.label, value: section.id }))}
        onValueChange={setActiveSection} /> : null}
          <View style={compact ? { display: "none" } : undefined}><View role="tablist" accessibilityLabel="Manager sections" style={styles.navStrip}>
            {MANAGER_SECTIONS.map(section => {
              const active = activeSection === section.id;
              return (
                <Pressable
                  key={section.id}
                  onPress={() => setActiveSection(section.id)}
                  accessibilityRole="tab"
                  accessibilityLabel={`${section.label} tab`}
                  accessibilityState={{ selected: active }}
                  style={(state: ControlState) => [
                    styles.navItem,
                    compact && styles.navItemCompact,
                    (active || (state.hovered && !active)) && { backgroundColor: colors.surface2 },
                    state.focused && focusRing(colors),
                    state.pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text
                    style={[
                      styles.navLabel,
                      compact && { fontSize: 12 },
                      { color: active ? colors.accent : colors.foregroundMuted },
                      active && { fontWeight: "700" },
                    ]}
                  >
                    {section.label}
                  </Text>
                </Pressable>
              );
            })}
          </View></View>

      <View style={sectionShown("overview")}><Card
        colors={colors}
        title={setupDone ? "You're set up" : "Get started"}
        subtitle={setupDone
          ? "Start an agent with the SLP Supervisor profile for hands-off work, or SLP Lead to direct the work yourself."
          : "Four steps, in order. Each button opens the screen for that step."}
        trailing={<Badge colors={colors} tone={setupDone ? "good" : "draft"} label={`${setupSteps.filter(step => step.done).length} of ${setupSteps.length} done`} />}
      >
        <SetupChecklist colors={colors} steps={setupSteps} />
      </Card></View>

      <View style={sectionShown("overview")}><Card
        colors={colors}
        title="How SLP works"
        subtitle="You talk to the Supervisor. It hands the work to a Lead, who splits it up and delegates each piece to a Peer."
      >
        <View style={styles.profileGrid}>
          <RoleGuideCard colors={colors} role="supervisor" current={profileSummary("supervisor")} actionLabel="Choose model" onAction={() => setActiveSection("profiles")} />
          <RoleGuideCard colors={colors} role="lead" current={profileSummary("lead")} actionLabel="Choose model" onAction={() => setActiveSection("profiles")} />
          <RoleGuideCard colors={colors} role="peer" current={poolSummary} actionLabel="Manage Peers" onAction={() => setActiveSection("pool")} />
        </View>
      </Card></View>

      {statusView ? (
        <View style={sectionShown("overview")}><Card
          colors={colors}
          title="Coding agents on this machine"
          subtitle="SLP can run its roles on any agent marked available. Install a missing one and press Refresh to use it."
        >
          <View style={styles.chipRow}>
            {statusView.families.map(family => {
              const available = family.availability === "available";
              return (
                <View key={family.family} style={[styles.chip, { borderColor: available ? colors.statusSuccess : colors.border }]}>
                  <Text style={[styles.chipLabel, { color: available ? colors.foreground : colors.foregroundMuted }]}>
                    {available ? "✓ " : ""}{FAMILY_LABEL[family.family]}{available ? "" : ` · ${family.availability === "unresolved" ? "not checked" : "not installed"}`}
                  </Text>
                </View>
              );
            })}
          </View>
          <KV colors={colors} label="Reply language" value={statusView.communicationLanguage ?? "Model default"} />
          <Collapse
            colors={colors}
            title="Technical details"
            subtitle="Versions, paths, hashes and the last operation"
            open={statusDetailsOpen}
            onToggle={() => setStatusDetailsOpen(open => !open)}
          >
            {statusView.families.filter(family => family.availability === "available").map(family => (
              <KV key={family.family} colors={colors} label={FAMILY_LABEL[family.family]} value={familyHint(family)} />
            ))}
            {statusRows(statusView, { full: true })
              .filter(row => row.label !== "Communication language")
              .map(row => (
                <KV key={row.label} colors={colors} label={row.label} value={row.value} />
              ))}
            {statusView.operation
              ? operationRows(statusView.operation).map(row => (
                  <KV key={row.label} colors={colors} label={row.label} value={row.value} />
                ))
              : null}
          </Collapse>
        </Card></View>
      ) : null}

      {/* Keep the Profiles frame mounted while the first read is pending. */}
        <View style={sectionShown("profiles")}>
        <RoutingCard
          colors={colors}
          target={target}
          statusView={statusView}
          routing={routing}
          onSave={requestSaveAndApply}
          applyBusy={saveApplyBusy || view.busy || view.pending != null}
          readOnly={!statusFresh || profileMetadataPending}
          catalogs={catalogs}
          catalogLoadingFor={catalogLoadingFor}
          retryCatalog={retryCatalog}
          retryFeatureSet={retryFeatureSet}
          catalogIsRefreshing={catalogIsRefreshing}
          featureIsRefreshing={featureIsRefreshing}
        />
        </View>
      {target ? (
        // The user-scope Peer pool — slp-runtime/state/peer-pool.json, the
        // catalog readCatalog resolves for every repository without its own
        // .paseo-slp/slp-routing.json. This card is its sole writer; it loads
        // with the target (independent of binding) and a
        // save takes effect the next time a Lead reads `routes`.
        <View style={sectionShown("pool")}>
        <PeerPoolCard
          colors={colors}
          target={target}
          compact={compact}
          statusView={statusView}
          pool={pool}
          availableFamilies={availableFamilies}
          catalogs={catalogs}
          catalogLoadingFor={catalogLoadingFor}
          retryCatalog={retryCatalog}
          retryFeatureSet={retryFeatureSet}
          scrollFocusNode={scrollFocusNode}
        />
        </View>
      ) : null}

      {statusView ? (
        <View style={sectionShown("language")}>
        <LanguageCard
          colors={colors}
          disabled={language.disabled || !statusFresh}
          busy={language.busy}
          on={language.on}
          value={language.value}
          onToggle={language.onToggle}
          onChangeText={language.onChangeText}
          onApply={language.onApply}
        />
        </View>
      ) : null}

      <View style={[{ gap: compact ? 12 : 16 }, sectionShown("maintenance")]}>
      <Card colors={colors} title="Runtime setup"
        subtitle={!statusView?.binding ? "Turn SLP on for this Paseo install. Tick both checks, then activate."
          : runtimeOutdated ? "Apply the SLP runtime that ships with this plugin. Tick both checks, then update."
          : "SLP is on and up to date. Saving Profiles applies its choices automatically, so you rarely need this."}>
        {confirmationControls()}
        <Button colors={colors} kind="primary" label={activationLabel(statusView)} onPress={runActivate}
          disabled={!canMutate || !statusView || routing.busy} />
      </Card>

      <RuntimeIdentity colors={colors} statusView={statusView} home={home} />

      <Collapse
        colors={colors}
        title="Advanced"
        subtitle="Executable overrides and recovery options"
        open={showAdvanced}
        onToggle={setShowAdvanced}
      >
        <Field
          colors={colors}
          label="Daemon home"
          hint="Detected automatically — change only to manage a different daemon home"
          value={homeOverride}
          onChangeText={setHomeOverride}
          placeholder={detectedHome ?? "/absolute/path/to/paseo-home"}
        />
        {homeOverride.trim() !== "" && !isDaemonHome(homeOverride.trim()) ? (
          <Text style={[styles.mutedSmall, { color: colors.statusDanger }]}>Enter an absolute path</Text>
        ) : null}
        <SwitchRow
          colors={colors}
          checked={adoptIdentical}
          onToggle={setAdoptIdentical}
          disabled={!canMutate}
          title="Adopt identical entries"
          hint="Adopt byte-identical existing SLP entries — recovery after a crash between patch and receipt"
        />
        <Field
          colors={colors}
          label="Node.js path (optional)"
          hint="Absolute path to a standard Node.js binary; an invalid value fails activation instead of falling back"
          value={nodePath}
          onChangeText={setNodePath}
          placeholder="/usr/bin/node"
          disabled={!canMutate}
        />
        {FAMILY_IDS.map(family => (
          <Field
            key={family}
            colors={colors}
            label={`${FAMILY_LABEL[family]} executable (optional)`}
            value={binaries[family]}
            onChangeText={text => setBinaries(previous => ({ ...previous, [family]: text }))}
            placeholder={`/absolute/path/to/${family}`}
            disabled={!canMutate}
          />
        ))}
      </Collapse>

      <Collapse
        colors={colors}
        title="Repair and removal"
        subtitle="Check for outside changes, finish an interrupted change, or turn SLP off"
        open={showMaintenance}
        onToggle={setShowMaintenance}
      >
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Reconcile action</Text>
          <ChipSelect<ReconcileAction>
            colors={colors}
            value={reconcileAction}
            options={[
              { label: "Inspect", value: "inspect" as const },
              { label: "Complete", value: "complete" as const },
              { label: "Restore before", value: "restore-before" as const },
            ]}
            onChange={setReconcileAction}
            disabled={!canMutate}
          />
          <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>
            {reconcileAction === "inspect" ? "Inspect only reads: it compares Paseo's configuration with what SLP last wrote and reports any difference."
              : reconcileAction === "complete" ? "Complete finishes an interrupted change, moving forward to what it was trying to apply."
              : "Restore before rolls an interrupted change back to how things were before it started."}
          </Text>
        </View>
        {reconcileAction !== "inspect" ? (
          <Field
            colors={colors}
            label="Interrupted operation ID"
            hint="Required for Complete and Restore before"
            value={interruptedId}
            onChangeText={setInterruptedId}
            placeholder="uuid"
            disabled={!canMutate}
          />
        ) : null}
        <Button
          colors={colors}
          label="Reconcile"
          onPress={runReconcile}
          disabled={!canMutate || !statusView}
        />
        <View style={[styles.divider, { borderTopColor: colors.border }]} />
        <View style={styles.field}>
          <Text style={[styles.fieldLabel, { color: colors.foreground }]}>Deactivate</Text>
          <Text style={[styles.guideBody, { color: colors.foreground }]}>Turns SLP off: removes the SLP providers and the SLP Supervisor and SLP Lead profiles from Paseo. Your other settings and any running agents are left alone.</Text>
          <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{RESTORATION_NOTICE}</Text>
          <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{RETAINED_RUNTIME_NOTICE}</Text>
          <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{DISABLE_REMOVE_NOTICE}</Text>
          <Button
            colors={colors}
            kind="danger"
            label="Deactivate"
            onPress={runDeactivate}
            disabled={!canMutate || !statusView?.binding}
          />
        </View>
      </Collapse>
      </View>
    </ScrollView>
  );
}
