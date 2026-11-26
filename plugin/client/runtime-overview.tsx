import { Text, View } from "react-native";
import type { StatusResult } from "../shared/contracts.ts";
import { Badge, Card, KV, styles } from "./ui-kit.tsx";
import type { Colors } from "./ui-kit.tsx";

/** Binding identity is server data, never an acceptance or activation oracle. */
export function RuntimeIdentity({ colors, statusView, home }: {
  colors: Colors; statusView: StatusResult | null; home: string;
}) {
  const binding = statusView?.binding;
  const same = binding != null && binding.candidateSha256 === statusView?.embeddedCandidateSha256;
  return <Card colors={colors} title="Runtime binding">
    <KV colors={colors} label={statusView ? "Daemon home (canonical)" : "Daemon home (awaiting inspection)"}
      value={statusView?.target.daemonHome ?? (home || "Not detected — open Maintenance to enter a home.")} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
        <Text style={[styles.fieldLabel, { color: colors.foregroundMuted }]}>Active binding</Text>
        <Text selectable style={[styles.mono, styles.mutedSmall, { color: colors.foreground, flexShrink: 1 }]}>
          {statusView ? binding?.candidateSha256 ?? "No active binding" : "Awaiting inspection"}
        </Text>
      </View>
      <View style={{ flex: 1, minWidth: 180, gap: 6 }}>
        <Text style={[styles.fieldLabel, { color: colors.foregroundMuted }]}>In this plugin</Text>
        <Text selectable style={[styles.mono, styles.mutedSmall, { color: colors.foreground, flexShrink: 1 }]}>
          {statusView?.embeddedCandidateSha256 ?? "Awaiting inspection"}
        </Text>
      </View>
    </View>
      <Badge colors={colors} label={!statusView ? "Awaiting inspection" : !binding ? "Not bound" : same ? "Candidate matches binding" : "Runtime differs from this plugin"}
        tone={!binding ? "neutral" : same ? "good" : "draft"} />
      {binding && !same ? <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>
        Choose Update SLP runtime to use the runtime packaged with this plugin. Reloading the UI does not change the active binding.
      </Text> : null}
      <KV colors={colors} label="Last binding verification" value={statusView ? statusView.verifiedAt ?? "Not yet verified" : "Awaiting inspection"} />
    <Text style={[styles.mutedSmall, { color: colors.foregroundMuted }]}>
      Runtime state and binding verification do not establish project acceptance.
    </Text>
  </Card>;
}
