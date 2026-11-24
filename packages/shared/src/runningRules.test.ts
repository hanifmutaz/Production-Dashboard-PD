import { describe, expect, it } from 'vitest';
import { defaultLineStatusSettings, missingRunningFields, RUNNING_FIELDS, type RunningField } from './runningRules.js';

describe('syarat Running (OQ-011)', () => {
  it('default: 7 field wajib, stale aktif juga di ringkasan', () => {
    expect(defaultLineStatusSettings(120)).toEqual({
      requiredFields: [...RUNNING_FIELDS],
      staleEnabled: true,
      staleThresholdMin: 120,
      staleInSummary: true,
    });
  });
  it('field yang belum terisi dilaporkan urut, hanya yang diwajibkan', () => {
    const filled = new Set<RunningField>(['cl_no', 'cell_leader', 'output_plan']);
    expect(missingRunningFields(filled, RUNNING_FIELDS)).toEqual(['line_leader', 'teknisi', 'inspector', 'output_actual']);
    expect(missingRunningFields(filled, ['cl_no', 'output_plan'])).toEqual([]);
    expect(missingRunningFields(filled, [])).toEqual([]);
  });
});
