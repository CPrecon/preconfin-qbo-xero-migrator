function normalizeObject(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalValue(value[key])]),
  );
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object")
    return normalizeObject(value as Record<string, unknown>);
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

function fingerprintValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(fingerprintValue)
      .sort((left, right) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)),
      );
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [
          key,
          fingerprintValue((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  if (typeof value === "number" && Object.is(value, -0)) return 0;
  return value;
}

export function stableStringify(value: unknown, space = 0): string {
  return JSON.stringify(canonicalValue(value), null, space);
}

export function stableFingerprint(value: unknown): string {
  return stableHash(JSON.stringify(fingerprintValue(value)));
}

export function stableHash(value: string): string {
  let forward = 0x811c9dc5;
  let reverse = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    forward ^= value.charCodeAt(index);
    forward = Math.imul(forward, 0x01000193);
    reverse ^= value.charCodeAt(value.length - index - 1);
    reverse = Math.imul(reverse, 0x85ebca6b);
  }
  return (
    (forward >>> 0).toString(16).padStart(8, "0") +
    (reverse >>> 0).toString(16).padStart(8, "0")
  );
}

export function stableId(prefix: string, ...parts: unknown[]): string {
  return prefix + "_" + stableHash(stableStringify(parts));
}

export function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export function deepFreeze<T>(value: T): Readonly<T> {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value as Readonly<T>;
  }
  for (const child of Object.values(value as Record<string, unknown>)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}
