/** Native plugins may reject with objects, not JavaScript Error instances. */
export function describeMobileError(error: unknown): string {
  const seen = new Set<unknown>();
  function extract(value: unknown, depth = 0): string | undefined {
    if (depth > 4 || value == null || seen.has(value)) return;
    if (typeof value === 'string') return value.trim() || undefined;
    if (typeof value !== 'object') return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ['message', 'error', 'cause']) {
      const message = extract(record[key], depth + 1);
      if (message) return message;
    }
    if (typeof record.code === 'string' && /^[A-Z0-9_-]{1,80}$/i.test(record.code)) {
      return 'Native operation failed (' + record.code + ').';
    }
  }
  // Never stringify an arbitrary object: it can contain the pairing token/certificate.
  return (extract(error) ?? 'The operation failed without a readable message. Retry and note which action failed.')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/("token"\s*:\s*")[^"]*"/gi, '$1[redacted]"')
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[certificate redacted]')
    .slice(0, 1200);
}

export function mobileFailure(phase: string, error: unknown): Error {
  return new Error(phase + ': ' + describeMobileError(error));
}
