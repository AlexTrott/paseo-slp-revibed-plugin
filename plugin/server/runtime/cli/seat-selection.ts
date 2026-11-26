import { presetChoiceSet, boundedPresetChoices } from "./preset-routing.ts";
import type { PresetRoutingContext } from "./preset-routing.ts";
// Ordinary formation selection. Only the admitted executor calls selectPeerSeat;
// CLI prepare/launchPlan revalidate the selection offline and never call this function.
// The Lead chooses among eligible pool options; a single eligible option is taken as is.
import type { Provider, Route } from "./types.ts";
import { readCatalog, eligibleOptions, catalogBinding } from "./routing.ts";
import { canonicalJson } from "./canonical-json.ts";
import { seatTokenConflict } from "../../../shared/runtime/routing-vocabulary.ts";

export type PeerSelectionRequest = {
  repository: string; assignment: string; paseoHome: string;
  selection?: { optionId: string; thinkingOptionId?: string | null };
  routingContext?: PresetRoutingContext;
};
export type SelectedPeer = {
  route: { optionId: string; catalogSha256: string; thinkingOptionId?: string | null; selectionSha256?: string; routingContext?: PresetRoutingContext };
  source: { repository: string; catalogFile: string; scope: string };
  origin: "unique" | "lead";
  selectionEvidence?: { policy: string; selectionGuidance: string; choice: import('./preset-routing.ts').PresetChoice };
};
export class SeatSelectionError extends Error {
  readonly code: "INVALID_RECORD" | "ROUTE_DRIFT" | "REQUEST_TOO_LARGE";
  readonly reason?: "selection-required" | "effort-required" | "pair-ineligible" | "no-eligible-pairs";
  readonly eligibleEfforts?: (string | null)[];
  constructor(code: SeatSelectionError["code"], message: string, reason?: SeatSelectionError["reason"], eligibleEfforts?: (string | null)[]) {
    super(message); this.name = "SeatSelectionError"; this.code = code; this.reason = reason; this.eligibleEfforts = eligibleEfforts;
  }
}
const MAX_SELECTION_BYTES = 32 * 1024;
const MAX_CHOICES = 32;
const MAX_CHOICES_BYTES = 32 * 1024;
function readInputs(request: PeerSelectionRequest) {
  const catalog = readCatalog(request.repository, request.paseoHome);
  if (catalog.version === 1 && (Object.keys(request.routingContext ?? {}).length || request.selection && Object.hasOwn(request.selection, "thinkingOptionId"))) throw new SeatSelectionError("INVALID_RECORD", "v1 pools keep fixed settings; explicitly convert to v2 before using effort selection or reference constraints");
  const usable = eligibleOptions(catalog, "peer").filter(option => catalog.version === 2 || !seatTokenConflict(option));
  if (usable.length === 0) throw new SeatSelectionError("INVALID_RECORD", "no eligible Peer option",
    catalog.version === 2 ? "no-eligible-pairs" : undefined);
  if (request.selection && !usable.some(option => option.id === request.selection!.optionId)) {
    throw new SeatSelectionError("INVALID_RECORD", "selection is not an eligible Peer option", catalog.version === 2
      ? catalog.options.some(option => option.id === request.selection!.optionId) ? "no-eligible-pairs" : "pair-ineligible"
      : undefined);
  }
  return { catalog, usable,
    source: { repository: request.repository, catalogFile: catalog.path, scope: catalog.scope } };
}
function requireSameInputs(request: PeerSelectionRequest, selected: SelectedPeer) {
  const now = readInputs(request);
  if (now.catalog.sha256 !== selected.route.catalogSha256 || canonicalJson(now.source) !== canonicalJson(selected.source)) {
    throw new SeatSelectionError("ROUTE_DRIFT", "pool source changed during formation");
  }
}
/** Pure local discovery; no intent or native resource is admitted. */
export async function preflightPeerChoice(request: PeerSelectionRequest, providers?: Provider[]) {
  if (readCatalog(request.repository, request.paseoHome).version === 2) return preflightPresetChoice(request, providers);
  const seen = readInputs(request);
  if (request.selection !== undefined || seen.usable.length === 1) return null;
  const choices: { optionId: string; provider: string; model: string; thinkingOptionId: string | null;
    suitableFor: string[]; avoidFor: string[] }[] = [];
  const reply = { ok: true as const, state: "selection-required" as const, operationAdmitted: false,
    source: seen.source, catalogSha256: seen.catalog.sha256, choices,
    omittedCount: seen.usable.length };
  for (const option of seen.usable.slice(0, MAX_CHOICES)) {
    choices.push({ optionId: option.id, provider: option.provider, model: option.model,
      thinkingOptionId: option.thinkingOptionId ?? null, suitableFor: option.suitableFor, avoidFor: option.avoidFor });
    if (Buffer.byteLength(JSON.stringify(reply)) > MAX_CHOICES_BYTES) { choices.pop(); break; }
  }
  reply.omittedCount = seen.usable.length - choices.length;
  if (choices.length === 0) throw new SeatSelectionError("REQUEST_TOO_LARGE", "Peer choice surface exceeds its byte budget");
  return reply;
}
/** Verify the fixed selection against fresh local inputs/live provider facts. */
export function revalidatePeerSelection(request: PeerSelectionRequest, selected: SelectedPeer, providers: Provider[]) {
  requireSameInputs(request, selected);
  if (selected.route.selectionSha256 && canonicalJson(request.routingContext ?? {}) !== canonicalJson(selected.route.routingContext ?? {})) throw new SeatSelectionError("ROUTE_DRIFT", "Reference runtime or routing requirements changed");
  return catalogBinding(request.repository, "peer", providers, selected.route as Route, request.paseoHome);
}
export async function selectPeerSeat(request: PeerSelectionRequest, deps: {
  providers: Provider[]; phase: (name: string, value: unknown) => void;
}): Promise<SelectedPeer> {
  if (readCatalog(request.repository, request.paseoHome).version === 2) return selectPresetPeer(request, deps);
  const seen = readInputs(request);
  let optionId = request.selection?.optionId;
  if (optionId === undefined) {
    if (seen.usable.length !== 1) throw new SeatSelectionError("INVALID_RECORD", "multiple eligible Peer options require selection", "selection-required");
    optionId = seen.usable[0].id;
  }
  const selected: SelectedPeer = {
    source: seen.source, route: { optionId, catalogSha256: seen.catalog.sha256 },
    origin: request.selection ? "lead" : "unique",
  };
  revalidatePeerSelection(request, selected, deps.providers);
  if (Buffer.byteLength(JSON.stringify(selected)) > MAX_SELECTION_BYTES) {
    throw new SeatSelectionError("REQUEST_TOO_LARGE", "Peer selection record exceeds its byte budget");
  }
  return selected;
}

function presetSet(request: PeerSelectionRequest, providers: Provider[] | undefined) {
  const set = presetChoiceSet(readCatalog(request.repository, request.paseoHome), 'peer', providers, request.routingContext);
  // Formation diagnostics only: CLI discovery/binding retains its original errors.
  if (set.choices.length === 0) throw new SeatSelectionError('INVALID_RECORD', 'No eligible preset + effort pair for the selected option or pool', 'no-eligible-pairs');
  return boundedPresetChoices(set);
}
function independentPresetPair(request: PeerSelectionRequest, choices: ReturnType<typeof presetSet>['choices']) {
  if (!request.selection) return undefined;
  const matches = choices.filter(c => c.optionId === request.selection!.optionId
    && (!Object.hasOwn(request.selection!, 'thinkingOptionId') || c.thinkingOptionId === request.selection!.thinkingOptionId));
  if (matches.length > 1) {
    // Only already-public effort IDs for this option; never labels, notes or other options.
    const efforts: (string | null)[] = [];
    for (const match of matches) {
      if (Buffer.byteLength(JSON.stringify([...efforts, match.thinkingOptionId])) > 384) break;
      efforts.push(match.thinkingOptionId);
    }
    throw new SeatSelectionError('INVALID_RECORD', 'Select one eligible preset + effort pair, including thinkingOptionId', 'effort-required', efforts);
  }
  if (!choices.some(c => c.optionId === request.selection!.optionId)) throw new SeatSelectionError('INVALID_RECORD', 'No eligible preset + effort pair for the selected option', 'no-eligible-pairs');
  if (matches.length === 0) throw new SeatSelectionError('INVALID_RECORD', 'Selection is not an eligible preset + effort pair', 'pair-ineligible');
  return matches[0];
}
function preflightPresetChoice(request: PeerSelectionRequest, providers: Provider[] | undefined) {
  const seen = readInputs(request), set = presetSet(request, providers);
  if (independentPresetPair(request, set.choices) || set.choices.length === 1) return null;
  return { ok: true as const, state: 'selection-required' as const, operationAdmitted: false,
    source: seen.source, catalogSha256: seen.catalog.sha256,
    selectionSha256: set.selectionSha256, policy: set.policy, selectionGuidance: set.selectionGuidance,
    choices: set.choices, excluded: set.excluded, omittedCount: 0 };
}
async function selectPresetPeer(request: PeerSelectionRequest, deps: Parameters<typeof selectPeerSeat>[1]): Promise<SelectedPeer> {
  const seen = readInputs(request), set = presetSet(request, deps.providers);
  let chosen = independentPresetPair(request, set.choices);
  if (!chosen) {
    if (set.choices.length !== 1) throw new SeatSelectionError('INVALID_RECORD', 'Multiple preset + effort pairs require selection', 'selection-required');
    chosen = set.choices[0];
  }
  const selected: SelectedPeer = { source: seen.source,
    route: { optionId: chosen.optionId, thinkingOptionId: chosen.thinkingOptionId, catalogSha256: seen.catalog.sha256,
      selectionSha256: set.selectionSha256, routingContext: set.context },
    origin: request.selection ? 'lead' : 'unique',
    selectionEvidence: { policy: set.policy, selectionGuidance: set.selectionGuidance, choice: chosen } };
  revalidatePeerSelection(request, selected, deps.providers);
  if (Buffer.byteLength(JSON.stringify(selected)) > MAX_SELECTION_BYTES) throw new SeatSelectionError('REQUEST_TOO_LARGE', 'Preset selection record exceeds its byte budget');
  return selected;
}

export const peerSelectionNeedsCapabilities = (request: PeerSelectionRequest) => readCatalog(request.repository, request.paseoHome).version === 2;
