// v2 routing is isolated from the retained v1 token/archetype contract.
import type { Catalog, CatalogOption, ResolvedCatalog } from './routing.ts';
import type { Provider, Route } from './types.ts';
import type { PresetFields } from '../../../shared/runtime/peer-presets.ts';
import { PRESET_ROUTING_VERSION, PRESET_SELECTION_GUIDANCE, isAutomaticEffort } from '../../../shared/runtime/peer-presets.ts';
import { providerId, families } from './profiles.ts';
import { verifyProvider, rejectRouteKeys, runtimeSettingKeys, profileRouteKeys } from './binding.ts';
import { canonicalJson } from './canonical-json.ts';
import { hash } from './package.ts';

export type PresetRoutingContext = {
  crossProvider?: boolean;
  reference?: { agentId?: string; provider: string; model: string };
};
export type PresetChoice = { candidateId: string; optionId: string; displayName: string; description: string;
  selectionHints: string; provider: string; model: string; modelProvider: string | null;
  thinkingOptionId: string | null; runtimeRule: string;
  modelLabel: string; modelDescription: string | null; effortLabel: string | null; effortDescription: string | null };
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
export function validateRoutingContext(value: unknown): PresetRoutingContext {
  if (value === undefined) return {};
  if (!object(value) || Object.keys(value).some(k => !['crossProvider', 'reference'].includes(k))
    || (value.crossProvider !== undefined && typeof value.crossProvider !== 'boolean')) throw new Error('Invalid preset routing context');
  const ref = value.reference;
  if (ref !== undefined && (!object(ref) || Object.keys(ref).some(k => !['agentId', 'provider', 'model'].includes(k))
    || ['provider', 'model'].some(k => typeof ref[k] !== 'string' || !(ref[k] as string).trim() || (ref[k] as string).length > 512)
    || (ref.agentId !== undefined && (typeof ref.agentId !== 'string' || !ref.agentId || ref.agentId.length > 256)))) throw new Error('Invalid reference runtime');
  return value as PresetRoutingContext;
}
const family = (provider: string) => families.find(f => provider === f || ['peer', 'lead', 'supervisor'].some(r => provider === providerId(r, f)));
export function presetChoiceSet(catalog: Catalog, role: string, providers: Provider[] | undefined, rawContext?: unknown) {
  const context = validateRoutingContext(rawContext), referenceProvider = context.reference ? family(context.reference.provider) ?? null : null;
  const choices: PresetChoice[] = [], excluded: { optionId: string; reasons: string[] }[] = [];
  const capabilities: { provider: string; model: string; thinkingOptions: unknown; defaultThinkingOptionId: unknown }[] = [];
  for (const option of catalog.options) {
    const preset = option as CatalogOption & PresetFields, reasons: string[] = [];
    if (!option.enabled) reasons.push('disabled');
    if (option.availability !== 'ready') reasons.push(`availability:${option.availability}`);
    if (!option.roles.includes(role)) reasons.push('role-not-listed');
    if (reasons.length) { excluded.push({ optionId: option.id, reasons }); continue; }
    const provider = providerId(role, option.provider), observed = providers?.find(p => p.id === provider);
    try { verifyProvider(providers, provider, () => option.provider); } catch { reasons.push('provider-unavailable'); }
    const model = observed?.models?.find(m => m.id === option.model && m.isSelectable !== false);
    if (!model) reasons.push('model-capability-unavailable');
    if (context.crossProvider || preset.runtimeRule === 'different-model-provider') {
      // Keep the original v2 rule literal readable. Cross-provider means a
      // different runtime family (e.g. Devin -> Codex), not a model vendor.
      if (!referenceProvider) reasons.push('reference-provider-unknown');
      else if (option.provider === referenceProvider) reasons.push('same-provider');
    }
    let efforts: (string | null)[] = [];
    if (model) {
      capabilities.push({ provider, model: model.id, thinkingOptions: model.thinkingOptions ?? [], defaultThinkingOptionId: model.defaultThinkingOptionId ?? null });
      const declared = model.thinkingOptions ?? [];
      if (preset.effortPolicy?.kind === 'fixed') {
        const fixed = preset.effortPolicy.thinkingOptionId;
        if (fixed !== null && !declared.some(e => e.id === fixed)) reasons.push('fixed-effort-unsupported');
        else efforts = [fixed];
      } else if (preset.effortPolicy?.kind === 'select') {
        efforts = declared.length === 0 && preset.effortPolicy.allowed === undefined ? [null]
          : declared.filter(isAutomaticEffort).filter(e => !preset.effortPolicy || preset.effortPolicy.kind !== 'select'
            || preset.effortPolicy.allowed === undefined || preset.effortPolicy.allowed.includes(e.id)).map(e => e.id);
        if (!efforts.length) reasons.push('no-supported-allowed-effort');
      } else reasons.push('invalid-effort-policy');
    }
    if (reasons.length) { excluded.push({ optionId: option.id, reasons }); continue; }
    for (const thinkingOptionId of [...new Set(efforts)]) {
      const effort = model?.thinkingOptions?.find(e => e.id === thinkingOptionId);
      choices.push({
      candidateId: `pair-${hash(canonicalJson([option.id, thinkingOptionId]))}`, optionId: option.id,
      displayName: preset.displayName!, description: preset.description!, selectionHints: preset.selectionHints ?? '',
      provider: option.provider, model: option.model, modelProvider: preset.modelProvider ?? null,
      thinkingOptionId, runtimeRule: preset.runtimeRule!,
      modelLabel: model?.label ?? option.model, modelDescription: model?.description ?? null,
      effortLabel: thinkingOptionId === null ? null : effort?.label ?? thinkingOptionId,
      effortDescription: effort?.description ?? null,
    }); }
  }
  const policy = catalog.policy, selectionGuidance = PRESET_SELECTION_GUIDANCE;
  const selectionSha256 = hash(canonicalJson({ semantics: PRESET_ROUTING_VERSION, policy, selectionGuidance, context, referenceProvider, capabilities, choices, excluded }));
  return { policy, selectionGuidance, choices, excluded, selectionSha256, context, referenceProvider };
}
export function boundedPresetChoices(set: ReturnType<typeof presetChoiceSet>) {
  if (set.choices.length === 0) throw new Error(`No eligible preset + effort pair: ${JSON.stringify(set.excluded)}`);
  if (set.choices.length > 64 || Buffer.byteLength(JSON.stringify(set)) > 24 * 1024) throw new Error('Preset choices exceed 64 pairs / 24 KiB; narrow the pool or allowed efforts before selecting (no candidates were truncated)');
  return set;
}
export function bindPresetCatalog(catalog: ResolvedCatalog, role: string, providers: Provider[] | undefined, route: Route) {
  const set = boundedPresetChoices(presetChoiceSet(catalog, role, providers, route.routingContext));
  if (route.selectionSha256 !== set.selectionSha256) throw new Error('Preset capabilities, reference or selection inputs changed; discover choices again');
  if (!Object.hasOwn(route, 'thinkingOptionId')) throw new Error('v2 requires an explicit selected thinkingOptionId (null for runtime default)');
  const choice = set.choices.find(c => c.optionId === route.optionId && c.thinkingOptionId === route.thinkingOptionId);
  if (!choice) throw new Error('Selected preset + effort is not eligible');
  rejectRouteKeys(route, [...profileRouteKeys, ...runtimeSettingKeys.filter(k => k !== 'thinkingOptionId')], key => `Preset runtime is complete; conflicting route.${key}`);
  const option = catalog.options.find(o => o.id === choice.optionId)!;
  if (route.decision != null) throw new Error('route.decision is not supported: routing decisions are made by the Lead');
  if (route.quotaFallbackFrom !== undefined) {
    const from = catalog.options.find(o => o.id === route.quotaFallbackFrom);
    if (!from || from.id === option.id || !from.roles.includes(role) || !catalog.quotaFallback?.enabled || catalog.quotaFallback.optionId !== option.id) throw new Error('Invalid designated quota fallback');
  }
  return { binding: { provider: providerId(role, option.provider), model: option.model, modeId: option.modeId,
    thinkingOptionId: choice.thinkingOptionId, features: structuredClone(option.features ?? {}) },
    routing: { catalogFile: catalog.path, catalogScope: catalog.scope, catalogSha256: catalog.sha256, optionId: option.id,
      thinkingOptionId: choice.thinkingOptionId, selectionSha256: set.selectionSha256, routingContext: set.context,
      ...(route.quotaFallbackFrom ? { quotaFallbackFrom: route.quotaFallbackFrom } : {}) }, warnings: [] as string[] };
}
