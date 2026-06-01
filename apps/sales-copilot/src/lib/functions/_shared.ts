/**
 * Shared utilities for function handlers.
 * Extracted from function-executor.ts to be reused across domain handler files.
 */

import { AccountService } from '@/generated/services/account-service';
import { calculateEnhancedMatchScore, getMatchThresholds } from '../agent-utils';

/**
 * Escape special characters for OData queries
 */
export function escapeODataString(value: string): string {
  return value
    .replace(/'/g, "''")
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ');
}

/**
 * Sanitize object fields for OData safety
 */
export function sanitizeForOData<T extends Record<string, unknown>>(obj: T): T {
  const sanitized: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value === undefined) continue;
    if (typeof value === 'string') {
      sanitized[key] = escapeODataString(value);
    } else if (value !== null) {
      sanitized[key] = value;
    }
  }
  return sanitized as T;
}

/**
 * Diagnostic wrapper for single-record Dataverse retrieves.
 */
const DIAG_RETRIEVE_MODE = false;

export async function diagRetrieve<T extends { id?: string }>(
  label: string,
  id: string,
  getFn: () => Promise<T>,
  listProbe?: () => Promise<Array<{ id?: string }>>,
): Promise<T> {
  try {
    return await getFn();
  } catch (err) {
    const raw = err instanceof Error ? err.message : typeof err === 'object' ? JSON.stringify(err) : String(err);
    let probe = '';
    if (DIAG_RETRIEVE_MODE && listProbe) {
      try {
        const all = await listProbe();
        const rec = all.find((r) => r.id === id) as Record<string, unknown> | undefined;
        if (rec) {
          let maxField = '(none)';
          let maxLen = 0;
          for (const [k, v] of Object.entries(rec)) {
            if (typeof v === 'string' && v.length > maxLen) { maxLen = v.length; maxField = k; }
          }
          probe = ` | list-read OK -> single-retrieve transport issue; longest field "${maxField}"=${maxLen} chars`;
        } else {
          probe = ` | list-read OK but id not found (${all.length} records)`;
        }
      } catch (probeErr) {
        const praw = probeErr instanceof Error ? probeErr.message : String(probeErr);
        probe = ` | list-read ALSO failed: ${praw}`;
      }
    }
    throw new Error(`[diagRetrieve ${label} id=${id}] ${raw}${probe}`);
  }
}

/**
 * Fuzzy-resolve user-typed account name → accountId
 */
export async function resolveAccountByName(name: string): Promise<string | undefined> {
  if (!name) return undefined;
  const accounts = await AccountService.getAll();
  let bestId: string | undefined;
  let bestScore = 0;
  for (const a of accounts) {
    if (!a.name1) continue;
    const s = calculateEnhancedMatchScore(name, a.name1);
    if (s.score > bestScore) { bestScore = s.score; bestId = a.id; }
  }
  if (bestScore >= getMatchThresholds().medium && bestId) {
    console.log(`[FN] resolveAccountByName: "${name}" → id=${bestId} (score=${bestScore})`);
    return bestId;
  }
  console.log(`[FN] resolveAccountByName: "${name}" → no match (best score=${bestScore})`);
  return undefined;
}
