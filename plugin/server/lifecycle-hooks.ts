// Lifecycle hook registration across supported hosts.
//
// Paseo 0.14 renamed every lifecycle hook and added `addHook`; the legacy
// `on`/`before` pair still maps onto the same registry but is removed after
// 2027-04-30. Hosts 0.11–0.13 expose only the legacy pair. SLP keeps its
// handlers written against the legacy names (`requirements.paseo` still
// admits those hosts) and registers them through whichever the host offers.
// Payloads and return handling are identical: the SDK routes both spellings
// to one `register(name, handler)`.
import type {
  PluginBeforeRequests,
  PluginHookContext,
  PluginLifecycleEvents,
  PluginLifecycleRegistration,
} from "@getpaseo/plugin/server";

const EVENT_HOOKS = {
  "workspace.created": "workspace.create.after",
  "workspace.archived": "workspace.archive.after",
  "agent.created": "agent.create.after",
  "agent.closed": "agent.close.after",
  "agent.archived": "agent.archive.after",
  "agent.turn_started": "agent.turn.before",
  "agent.turn_ended": "agent.turn.after",
  "agent.permission_requested": "agent.permission.before",
  "agent.permission_resolved": "agent.permission.after",
} as const satisfies Record<keyof PluginLifecycleEvents, string>;

const REQUEST_HOOKS = {
  "workspace.create": "workspace.create.before",
  "agent.create": "agent.create.before",
  "agent.session_open": "agent.open.before",
} as const satisfies Record<keyof PluginBeforeRequests, string>;

type Register = (name: string, handler: (input: never, context: PluginHookContext) => unknown) => () => void;

export type LifecycleHooks = Pick<PluginLifecycleRegistration, "on" | "before">;

export function lifecycleHooks(server: Partial<PluginLifecycleRegistration>): LifecycleHooks {
  const addHook = typeof server.addHook === "function" ? (server.addHook.bind(server) as unknown as Register) : null;
  const legacy = (kind: "on" | "before"): Register => {
    const register = server[kind];
    if (typeof register !== "function") throw new Error(`Paseo host offers neither addHook nor the legacy ${kind} lifecycle registration`);
    return register.bind(server) as unknown as Register;
  };
  return {
    on: (name, handler) => addHook !== null
      ? addHook(EVENT_HOOKS[name], handler as never)
      : legacy("on")(name, handler as never),
    before: (name, handler) => addHook !== null
      ? addHook(REQUEST_HOOKS[name], handler as never)
      : legacy("before")(name, handler as never),
  };
}
