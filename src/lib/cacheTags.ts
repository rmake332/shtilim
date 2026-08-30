import { TABLES } from '@/lib/airtable/schema';

/**
 * Cache tags for the handful of Airtable reads that are cached (everything else
 * goes through the client with cache: 'no-store' and is always live).
 *
 * An Airtable automation posts to /api/revalidate when a record changes, which
 * drops the matching tag — so edits in Airtable show up in the form within
 * seconds instead of waiting out the TTL. The TTLs remain as a safety net for
 * when the automation is off or fails.
 */
export const CACHE_TAGS = {
  /** תקציב התחלתי rows per institution (roles, remaining hours, schedule type…). */
  budget: 'airtable-budget',
  /** Symbol list per institution (derived from תקציב + סמלי מוסד). */
  symbols: 'airtable-symbols',
  /** תקנים תשפ"ו rows per employee. */
  prevYear: 'airtable-prev-year',
  /** singleSelect / multipleSelects choices from the Meta API (all tables). */
  fieldChoices: 'airtable-field-choices',
  /** תת-תפקידים: הרשימה הקנונית והתנאים הנגזרים מכל ערך. */
  subRoles: 'airtable-sub-roles',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

export const ALL_CACHE_TAGS: CacheTag[] = Object.values(CACHE_TAGS);

/**
 * Which tags a change in a given Airtable table invalidates.
 * Accepts a table id (tblXXXX) or one of the friendly keys below, case-insensitively.
 * The Meta-API tag is included everywhere: a select's choices can be edited on any table.
 */
const TABLE_TAGS: Record<string, CacheTag[]> = {
  [TABLES.budget]: [CACHE_TAGS.budget, CACHE_TAGS.symbols, CACHE_TAGS.fieldChoices],
  [TABLES.institutionSymbols]: [CACHE_TAGS.symbols, CACHE_TAGS.fieldChoices],
  [TABLES.prevYearPositions]: [CACHE_TAGS.prevYear, CACHE_TAGS.fieldChoices],
  [TABLES.subRoles]: [CACHE_TAGS.subRoles, CACHE_TAGS.fieldChoices],
  budget: [CACHE_TAGS.budget, CACHE_TAGS.symbols, CACHE_TAGS.fieldChoices],
  symbols: [CACHE_TAGS.symbols, CACHE_TAGS.fieldChoices],
  'prev-year': [CACHE_TAGS.prevYear, CACHE_TAGS.fieldChoices],
  'sub-roles': [CACHE_TAGS.subRoles, CACHE_TAGS.fieldChoices],
  choices: [CACHE_TAGS.fieldChoices],
};

/**
 * Resolve the tags to drop for a table id / friendly key.
 * Unknown or missing input → all tags (a change we can't place is safest flushed whole).
 */
export function tagsForTable(table?: string | null): CacheTag[] {
  if (!table) return ALL_CACHE_TAGS;
  return TABLE_TAGS[table] ?? TABLE_TAGS[table.trim().toLowerCase()] ?? ALL_CACHE_TAGS;
}
