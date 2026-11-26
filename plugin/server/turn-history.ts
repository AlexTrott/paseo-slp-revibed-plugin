import type { AgentTimelineItem } from "@getpaseo/protocol/agent-types";
import type { PluginLifecycleEvents } from "@getpaseo/plugin/server";

/** The turn-ended payload as SLP consumes it. `timeline` left the SDK type
 *  in 0.16: hosts through 0.12 fill it, 0.13–0.17 send it empty, and the
 *  host's compatibility copy is scheduled for removal, so it is optional. */
export type TurnEnded = PluginLifecycleEvents["agent.turn_ended"] & { timeline?: readonly AgentTimelineItem[] };
/** A turn whose history is established: carried by the host or read back. */
export type ObservedTurn = TurnEnded & { timeline: readonly AgentTimelineItem[] };
type Page = {
  agentId: string;
  entries: { turnId?: string; item: AgentTimelineItem }[];
  hasOlder: boolean;
  hasNewer: boolean;
  error: string | null;
  reset: boolean;
  staleCursor: boolean;
  gap: boolean;
};
export type TurnHistoryApi = {
  agents: { ref(id: string): {
    timeline?: { refetch(options: { direction: "tail"; limit: number; projection: "projected" }): Promise<Page> };
  } };
};

// 0.13+ turn-ended hooks carry no history. One bounded tail read
// supplies evidence only when BOTH edges of the exact turn are visible.
// Truncated, unlabelled or failed reads cannot establish an observation.
export async function readTurnHistory(event: TurnEnded, paseo: TurnHistoryApi,
  signal: AbortSignal = new AbortController().signal, timeoutMs = 1500): Promise<ObservedTurn | null> {
  if (signal.aborted) return null;
  const carried = event.timeline;
  if (carried !== undefined && carried.length > 0) return event as ObservedTurn; // Legacy hosts retain their payload contract.
  if (event.turnId === null) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    const history = paseo.agents.ref(event.agent.id).timeline;
    if (!history) return null;
    const page = await Promise.race([
      history.refetch({ direction: "tail", limit: 500, projection: "projected" }),
      new Promise<null>(resolve => {
        timer = setTimeout(() => resolve(null), timeoutMs);
        abort = () => resolve(null);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      }),
    ]);
    if (!page || signal.aborted || page.agentId !== event.agent.id || page.error || page.reset || page.staleCursor || page.gap
      || typeof page.hasOlder !== "boolean" || typeof page.hasNewer !== "boolean" || page.entries.length > 500) return null;
    const first = page.entries.findIndex(row => row.turnId === event.turnId);
    if (first < 0) return null;
    let end = first;
    while (end < page.entries.length && page.entries[end].turnId === event.turnId) end++;
    if ((first === 0 ? page.hasOlder : !page.entries[first - 1].turnId)
      || (end === page.entries.length ? page.hasNewer : !page.entries[end].turnId)
      || page.entries.slice(end).some(row => row.turnId === event.turnId)) return null;
    return { ...event, timeline: page.entries.slice(first, end).map(row => row.item) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    if (abort) signal.removeEventListener("abort", abort);
  }
}
