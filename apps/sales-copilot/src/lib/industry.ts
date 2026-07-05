/**
 * Dataverse `account.industrycode` option-set → display label.
 *
 * The app stores the numeric option-set code (as a string, e.g. "11"); this maps
 * it to the human-readable industry name so users never see a bare code.
 * Source: account.industrycode option set
 * (.power/schemas/dataverse/accounts.Schema.json).
 */
const INDUSTRY_LABELS: Record<number, string> = {
  1: 'Accounting',
  2: 'Agriculture and Non-petrol Natural Resource Extraction',
  3: 'Broadcasting Printing and Publishing',
  4: 'Brokers',
  5: 'Building Supply Retail',
  6: 'Business Services',
  7: 'Consulting',
  8: 'Consumer Services',
  9: 'Design, Direction and Creative Management',
  10: 'Distributors, Dispatchers and Processors',
  11: "Doctor's Offices and Clinics",
  12: 'Durable Manufacturing',
  13: 'Eating and Drinking Places',
  14: 'Entertainment Retail',
  15: 'Equipment Rental and Leasing',
  16: 'Financial',
  17: 'Food and Tobacco Processing',
  18: 'Inbound Capital Intensive Processing',
  19: 'Inbound Repair and Services',
  20: 'Insurance',
  21: 'Legal Services',
  22: 'Non-Durable Merchandise Retail',
  23: 'Outbound Consumer Service',
  24: 'Petrochemical Extraction and Distribution',
  25: 'Service Retail',
  26: 'SIG Affiliations',
  27: 'Social Services',
  28: 'Special Outbound Trade Contractors',
  29: 'Specialty Realty',
  30: 'Transportation',
  31: 'Utility Creation and Distribution',
  32: 'Vehicle Retail',
  33: 'Wholesale',
};

/**
 * Returns the human-readable industry label for a stored industry value.
 *
 * Accepts the numeric option-set code (number or numeric string). If the value
 * is already a non-numeric label it is returned trimmed as-is. Returns
 * `undefined` for empty/unknown input.
 */
export function industryLabel(value: string | number | null | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const code = Number(value);
  if (Number.isFinite(code)) return INDUSTRY_LABELS[code] ?? undefined;
  return typeof value === 'string' ? value.trim() || undefined : String(value);
}
