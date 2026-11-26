// Plain-language guidance for the manager surface: what each role is for,
// which kind of model suits it, where setup stands, and what a conflict
// means. Presentation and advisory copy only — nothing here gates, selects
// or mutates; the recommendations are advice to the Human, never a default
// the plugin applies.
import { Pressable, Text, View } from "react-native";
import type { ConflictValue, StatusResult } from "../shared/contracts.ts";
import { Badge, Button, focusRing, styles } from "./ui-kit.tsx";
import type { Colors, ControlState } from "./ui-kit.tsx";
import type { ManagerSectionId } from "./manager-navigation.ts";

export type GuideRole = "supervisor" | "lead" | "peer";

export const ROLE_GUIDE: Record<GuideRole, {
  title: string; tagline: string; does: string; tier: string; recommend: string; section: ManagerSectionId;
}> = {
  supervisor: {
    title: "Supervisor",
    tagline: "Your point of contact",
    does: "Takes your request, keeps the Lead moving and reports back to you. It observes and relays; it never writes code or makes technical calls.",
    tier: "Balanced model · medium reasoning",
    recommend: "It stays on for the whole job in many short turns, so pick a dependable mid-tier model. A frontier model works but mostly adds cost here.",
    section: "profiles",
  },
  lead: {
    title: "Lead",
    tagline: "Plans, delegates and accepts the work",
    does: "Frames the task, splits it up, picks a Peer for each piece, integrates the results and decides when the work is done.",
    tier: "Frontier model · high reasoning",
    recommend: "Its judgment shapes everything downstream. Use your strongest model with a large context window — this is where capability pays for itself.",
    section: "profiles",
  },
  peer: {
    title: "Peers",
    tagline: "Do the hands-on work",
    does: "Write code, tests, docs and reviews for one bounded task each. The Lead picks a Peer from the pool you configure.",
    tier: "A range, cheapest that fits",
    recommend: "Offer a fast model for routine work, a balanced one for everyday coding, a strong one for hard problems, and one from a different provider for independent review.",
    section: "pool",
  },
};

/** Short human names for runtime states; the raw state stays in Details. */
export function friendlyState(status: StatusResult | null): { label: string; tone: "good" | "draft" | "bad" | "neutral" | "managed" } {
  if (!status) return { label: "Checking…", tone: "neutral" };
  switch (status.state) {
    case "ACTIVE": return { label: "Active", tone: "good" };
    case "INACTIVE": return { label: status.binding ? "Inactive" : "Not set up", tone: "neutral" };
    case "ACTIVATING": return { label: "Applying…", tone: "managed" };
    case "DEACTIVATING": return { label: "Removing…", tone: "managed" };
    case "RECOVERY_REQUIRED": return { label: "Needs attention", tone: "draft" };
    default: return { label: status.state, tone: "neutral" };
  }
}

/** One role, explained: what it does, what to give it, what it has now. */
export function RoleGuideCard({ colors, role, current, actionLabel, onAction }: {
  colors: Colors; role: GuideRole; current: string; actionLabel: string; onAction: () => void;
}) {
  const guide = ROLE_GUIDE[role];
  return (
    <View style={[styles.guideCard, { borderColor: colors.border, backgroundColor: colors.surface0 }]}>
      <View style={{ gap: 2 }}>
        <Text style={[styles.profileRole, { color: colors.foreground }]}>{guide.title}</Text>
        <Text style={[styles.mutedSmall, { color: colors.accent }]}>{guide.tagline}</Text>
      </View>
      <Text style={[styles.guideBody, { color: colors.foregroundMuted }]}>{guide.does}</Text>
      <RoleRecommendation colors={colors} role={role} />
      <View style={{ gap: 2 }}>
        <Text style={[styles.eyebrow, { color: colors.foregroundMuted }]}>Currently</Text>
        <Text style={[styles.guideBody, { color: colors.foreground }]}>{current}</Text>
      </View>
      <Button colors={colors} label={actionLabel} onPress={onAction} />
    </View>
  );
}

/** The "what should I pick" box shared by Overview and the profile panels. */
export function RoleRecommendation({ colors, role }: { colors: Colors; role: GuideRole }) {
  const guide = ROLE_GUIDE[role];
  return (
    <View style={[styles.recommendBox, { backgroundColor: colors.surface2, borderLeftColor: colors.accent }]}>
      <Text style={[styles.eyebrow, { color: colors.foregroundMuted }]}>Recommended</Text>
      <Text style={[styles.checkTitle, { color: colors.foreground }]}>{guide.tier}</Text>
      <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{guide.recommend}</Text>
    </View>
  );
}

export type SetupStep = { id: string; title: string; detail: string; done: boolean; actionLabel?: string; onAction?: () => void };

/** Numbered setup path: finished steps tick off, the first open one is
 *  highlighted and carries the action. */
export function SetupChecklist({ colors, steps }: { colors: Colors; steps: readonly SetupStep[] }) {
  const next = steps.findIndex(step => !step.done);
  return (
    <View style={{ gap: 8 }}>
      {steps.map((step, index) => {
        const current = index === next;
        const tone = step.done ? colors.statusSuccess : current ? colors.accent : colors.border;
        return (
          <View key={step.id} style={[styles.stepRow, { borderColor: current ? colors.accent : colors.border, backgroundColor: colors.surface0 }]}>
            <View style={[styles.stepMarker, { borderColor: tone }]}>
              <Text style={[styles.stepMarkerLabel, { color: step.done ? colors.statusSuccess : current ? colors.accent : colors.foregroundMuted }]}>
                {step.done ? "✓" : String(index + 1)}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
              <Text style={[styles.checkTitle, { color: colors.foreground }]}>{step.title}</Text>
              <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>{step.detail}</Text>
            </View>
            {step.actionLabel && step.onAction && (current || step.done) ? (
              <Button colors={colors} kind={current ? "primary" : "ghost"} label={step.actionLabel} onPress={step.onAction} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

type Advice = { title: string; meaning: string; fix: string };
const CONFLICT_ADVICE: Partial<Record<ConflictValue["code"], Advice>> = {
  OWNERSHIP_DRIFT: {
    title: "An SLP entry was changed outside this plugin",
    meaning: "A provider or profile that SLP manages no longer matches what SLP last wrote — for example it was switched off or edited in Paseo's own settings.",
    fix: "Undo that outside change, then press Refresh. If you can't, open Maintenance and run Reconcile with Inspect to see exactly what differs.",
  },
  COLLISION: {
    title: "A name SLP needs is already taken",
    meaning: "Your Paseo configuration already has a provider or profile with an SLP name that this plugin did not create.",
    fix: "Rename or remove that entry in Paseo settings, or open Maintenance → Advanced and turn on \"Adopt identical entries\" if it is a leftover from an earlier SLP install.",
  },
  SCHEMA_LOSS: {
    title: "Paseo's configuration has a setting this plugin does not know",
    meaning: "Saving now could drop that setting, so SLP stopped. This usually means Paseo is newer than this plugin.",
    fix: "Update SLP Revibed to the latest version, then try again.",
  },
  RAW_LIVE_DIVERGENCE: {
    title: "Paseo's saved and running configuration disagree",
    meaning: "The configuration file on disk differs from what the running daemon reports.",
    fix: "Re-save the affected setting in Paseo, or restart the Paseo daemon, then press Refresh.",
  },
  EXECUTABLE_UNAVAILABLE: {
    title: "A provider's command-line tool was not found",
    meaning: "SLP could not find or run the executable for a provider you selected.",
    fix: "Install that provider's CLI, or give its path under Maintenance → Advanced.",
  },
  MCP_DISABLED: {
    title: "Paseo tools are switched off",
    meaning: "SLP roles talk to each other through Paseo's agent tools, which are disabled on this daemon.",
    fix: "Enable Paseo's MCP/agent tools in Paseo settings, then press Refresh.",
  },
  RECOVERY_REQUIRED: {
    title: "A previous change did not finish",
    meaning: "An earlier apply or remove was interrupted, so SLP will not change anything until it is resolved.",
    fix: "Open Maintenance and run Reconcile with Inspect first; it reports which operation to complete or roll back.",
  },
  PATCH_OUTCOME_UNKNOWN: {
    title: "SLP could not confirm its last change",
    meaning: "The configuration write was sent but its result was never confirmed.",
    fix: "Open Maintenance and run Reconcile with Inspect before trying again.",
  },
  DEPENDENT_REFERENCE: {
    title: "Something still uses an SLP entry",
    meaning: "Another profile or setting refers to a provider SLP was asked to remove.",
    fix: "Point that profile at a different provider in Paseo settings, then try again.",
  },
  RUNTIME_INTEGRITY: {
    title: "The installed SLP runtime files look damaged",
    meaning: "The runtime on disk does not match what this plugin installed.",
    fix: "Open Maintenance and run the runtime setup again to reinstall it.",
  },
  BUSY: {
    title: "Another SLP operation is still running",
    meaning: "Only one configuration change can run at a time.",
    fix: "Wait a few seconds and press Refresh.",
  },
  HOME_UNVERIFIED: {
    title: "The Paseo home folder is not confirmed",
    meaning: "SLP needs you to confirm which Paseo home it is changing.",
    fix: "Tick \"Daemon home confirmed\" when asked, after checking the path shown.",
  },
};

export function conflictAdvice(conflict: ConflictValue): Advice {
  return CONFLICT_ADVICE[conflict.code] ?? {
    title: "SLP stopped to keep your configuration safe",
    meaning: conflict.message,
    fix: "Press Refresh. If it persists, open Maintenance and run Reconcile with Inspect.",
  };
}

/** Conflicts in plain language first; the exact server line stays one tap
 *  away and selectable for support. */
export function ConflictBanner({ colors, conflicts, technical, open, onToggle, onMaintenance }: {
  colors: Colors; conflicts: readonly ConflictValue[]; technical: readonly string[];
  open: boolean; onToggle: () => void; onMaintenance: () => void;
}) {
  if (conflicts.length === 0) return null;
  const seen = new Set<string>();
  const advice = conflicts.map(conflict => ({ conflict, advice: conflictAdvice(conflict) }))
    .filter(entry => !seen.has(entry.advice.title) && seen.add(entry.advice.title));
  return (
    <View accessibilityRole="alert" style={[styles.banner, { borderColor: colors.statusDanger, backgroundColor: colors.surface1 }]}>
      <View style={styles.cardHeadRow}>
        <Text style={[styles.checkTitle, { color: colors.statusDanger, flex: 1, minWidth: 180 }]}>
          SLP paused changes — {conflicts.length === 1 ? "one thing needs" : `${conflicts.length} things need`} your attention
        </Text>
        <Badge colors={colors} tone="bad" label="Nothing was changed" />
      </View>
      {advice.map(({ conflict, advice }) => (
        <View key={`${conflict.code}:${conflict.path}`} style={{ gap: 3 }}>
          <Text style={[styles.checkTitle, { color: colors.foreground }]}>{advice.title}</Text>
          <Text style={[styles.guideBody, { color: colors.foregroundMuted }]}>{advice.meaning}</Text>
          <Text style={[styles.guideBody, { color: colors.foreground }]}>What to do: {advice.fix}</Text>
        </View>
      ))}
      <View style={styles.chipRow}>
        <Button colors={colors} label="Open Maintenance" onPress={onMaintenance} />
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }}
          style={(state: ControlState) => [{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6, borderRadius: 6 }, state.focused && focusRing(colors), state.pressed && { opacity: 0.75 }]}>
          <Text style={[styles.selectBoxLink, { color: colors.accent }]}>{open ? "Hide technical details" : "Show technical details"}</Text>
        </Pressable>
      </View>
      {open ? technical.map((line, index) => (
        <Text key={index} selectable style={[styles.mono, styles.mutedSmall, { color: colors.foregroundMuted }]}>{line}</Text>
      )) : null}
    </View>
  );
}
