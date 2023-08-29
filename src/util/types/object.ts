/** Test if val is a non null object */
export function isObject (val: unknown): val is Record<PropertyKey, unknown> {
  return Boolean(val && typeof val === 'object');
}
