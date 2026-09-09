import { describe, expect, it } from 'vitest';
import { assertValidStatusTransition, isValidStatusTransition } from './status.js';

describe('ticket status transitions', () => {
  it('allows the supported forward workflow', () => {
    expect(isValidStatusTransition('Open', 'In Progress')).toBe(true);
    expect(isValidStatusTransition('In Progress', 'Resolved')).toBe(true);
    expect(isValidStatusTransition('Resolved', 'Closed')).toBe(true);
  });

  it('rejects reopening a closed ticket', () => {
    expect(isValidStatusTransition('Closed', 'Open')).toBe(false);
    expect(() => assertValidStatusTransition('Closed', 'Open')).toThrow(
      'Invalid status transition from Closed to Open',
    );
  });
});
