// Canonical JSON: object keys sorted at every depth, one trailing newline.
// Hashes over routing inputs and pool files are taken over this form.
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
  return value;
};
export const canonicalJson = (value: unknown) => JSON.stringify(sortValue(value)) + '\n';
