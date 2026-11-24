import { describe, expect, it } from 'vitest';
import { avatarTone, initials } from './avatar';

describe('avatar', () => {
  it('takes the first and last initials', () => {
    expect(initials('Priya Sharma')).toBe('PS');
    expect(initials('Aditya Kulkarni')).toBe('AK');
    expect(initials('Madonna')).toBe('M');
  });

  it('gives the same name the same tone, within 1–8', () => {
    expect(avatarTone('Ravi Kumar')).toBe(avatarTone('Ravi Kumar'));
    for (const name of ['Priya Sharma', 'Ravi Kumar', 'Anil Mehta', 'Meera Iyer']) {
      expect(avatarTone(name)).toBeGreaterThanOrEqual(1);
      expect(avatarTone(name)).toBeLessThanOrEqual(8);
    }
  });
});
