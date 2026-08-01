/**
 * Reading a model's reply.
 *
 * A model asked for JSON still returns prose around it, fences it, or answers a
 * list with a string. Every reply is put through the same narrow gate here so
 * each caller states what it needs rather than re-deriving how to salvage it.
 */

/** Pulls the JSON object out of a reply that may still carry a fence or prose. */
export function extractJsonObject(raw: string): string | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

/** A single line of prose, or empty when the model returned anything else. */
export function cleanText(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * Trimmed, de-duplicated, non-empty lines. A single string counts as a list of
 * one, because models answer "a list" that way often enough to be worth taking.
 */
export function cleanList(raw: unknown, limit: number): string[] {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? [raw] : [];
  const out: string[] = [];
  for (const item of items) {
    const text = cleanText(item);
    if (!text || out.includes(text)) continue;
    out.push(text);
    if (out.length === limit) break;
  }
  return out;
}
