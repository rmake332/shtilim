import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POSITION_FIELDS } from '../lib/airtable/schema';

vi.mock('server-only', () => ({}));

const listRecords = vi.fn();
vi.mock('../lib/airtable/client', () => ({
  listRecords: (...args: unknown[]) => listRecords(...args),
  escapeFormulaValue: (s: string) => s,
}));

const { sumExistingPositions } = await import('../lib/existingPositions');

const MOSAD_A = 'recInstitutionA';
const MOSAD_B = 'recInstitutionB';

/** An active position with the fields the sum reads. */
function position(opts: {
  id: string;
  mosadId: string;
  category?: string;
  layer?: string;
  frontal?: number;
  individual?: number;
  stay?: number;
  prevYear?: boolean;
}) {
  return {
    id: opts.id,
    fields: {
      [POSITION_FIELDS.mosadLookup]: [opts.mosadId],
      [POSITION_FIELDS.category]: [opts.category ?? 'הוראה'],
      [POSITION_FIELDS.layer]: opts.layer ?? 'יסודי',
      [POSITION_FIELDS.frontalHours]: opts.frontal ?? 0,
      [POSITION_FIELDS.individualHours]: opts.individual ?? 0,
      [POSITION_FIELDS.stayHours]: opts.stay ?? 0,
      ...(opts.prevYear ? { [POSITION_FIELDS.prevYearStatus]: 'כן' } : {}),
    },
  };
}

const params = { tz: '318866779', category: 'הוראה', layer: 'יסודי' };

describe('sumExistingPositions', () => {
  beforeEach(() => listRecords.mockReset());

  it('sums matching positions across all institutions (ofek is cross-institution)', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, frontal: 10, individual: 2, stay: 3 }),
      position({ id: 'rec2', mosadId: MOSAD_B, frontal: 5, individual: 1, stay: 1 }),
    ]);

    const sum = await sumExistingPositions(params);

    expect(sum.count).toBe(2);
    expect(sum.frontalHours).toBe(15);
    expect(sum.individualHours).toBe(3);
    expect(sum.stayHours).toBe(4);
  });

  it('narrows sameInstitution to the requested מוסד', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, frontal: 10, individual: 2, stay: 3 }),
      position({ id: 'rec2', mosadId: MOSAD_B, frontal: 5, individual: 1, stay: 1 }),
    ]);

    const sum = await sumExistingPositions({ ...params, mosadId: MOSAD_A });

    expect(sum.count).toBe(2); // ofek still sees both
    expect(sum.sameInstitution).toEqual({
      count: 1,
      frontalHours: 10,
      individualHours: 2,
      stayHours: 3,
    });
  });

  it('leaves sameInstitution empty when no mosadId is given', async () => {
    listRecords.mockResolvedValue([position({ id: 'rec1', mosadId: MOSAD_A, frontal: 10 })]);

    const sum = await sumExistingPositions(params);

    expect(sum.sameInstitution).toEqual({
      count: 0,
      frontalHours: 0,
      individualHours: 0,
      stayHours: 0,
    });
  });

  it('excludes prior-year positions and the edited position from both totals', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, frontal: 10 }),
      position({ id: 'recPrevYear', mosadId: MOSAD_A, frontal: 20, prevYear: true }),
      position({ id: 'recEdited', mosadId: MOSAD_A, frontal: 40 }),
    ]);

    const sum = await sumExistingPositions({
      ...params,
      mosadId: MOSAD_A,
      excludePositionId: 'recEdited',
    });

    expect(sum.frontalHours).toBe(10);
    expect(sum.sameInstitution.frontalHours).toBe(10);
  });

  it('excludes positions from another category or layer', async () => {
    listRecords.mockResolvedValue([
      position({ id: 'rec1', mosadId: MOSAD_A, frontal: 10 }),
      position({ id: 'rec2', mosadId: MOSAD_A, category: 'סיוע', frontal: 7 }),
      position({ id: 'rec3', mosadId: MOSAD_A, layer: 'חטיבה', frontal: 8 }),
    ]);

    const sum = await sumExistingPositions({ ...params, mosadId: MOSAD_A });

    expect(sum.count).toBe(1);
    expect(sum.sameInstitution.frontalHours).toBe(10);
  });
});
