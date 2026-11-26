// Credential-shaped text detection for values SLP stores or relays.
// Assemble detector-matching literals from fragments so source files do not
// themselves look like credentials. Order and regex flags are contractual.
const credentialPatterns = [
  { name: "openrouter-key", pattern: new RegExp("\\b" + "sk-or-" + "[A-Za-z0-9_-]{12,}") },
  { name: "typesafe-key", pattern: /\bts-[A-Za-z0-9_-]{12,}/ },
  { name: "openai-style-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { name: "bearer-token", pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/i },
  { name: "private-key-block", pattern: new RegExp("-----BEGIN " + "[A-Z0-9 ]*" + "PRIVATE" + " KEY-----") },
  { name: "aws-access-key", pattern: new RegExp("\\b" + "AKIA" + "[0-9A-Z]{16}" + "\\b") },
  { name: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/ },
];

/** The name of the first credential pattern the text matches, or null. */
export function credentialShaped(text: unknown): string | null {
  if (typeof text !== "string") return null;
  return credentialPatterns.find(({ pattern }) => pattern.test(text))?.name ?? null;
}
