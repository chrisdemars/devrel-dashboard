import { describe, expect, test } from 'vitest';
import { contrastRatio, luminance } from '../src/lib/color';
import {
  changeFrom,
  describeDelta,
  formatDay,
  formatDayRange,
  formatNumber,
  formatPercent,
  formatUsd,
} from '../src/lib/format';

describe('formatNumber', () => {
  test('small numbers are written out; large ones are shortened', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(1284)).toBe('1,284');
    expect(formatNumber(9999)).toBe('9,999');
    expect(formatNumber(12_900)).toBe('12.9K');
    expect(formatNumber(4_200_000)).toBe('4.2M');
    expect(formatNumber(-15_000)).toBe('-15K');
  });
});

test('formatPercent rounds to a whole percent', () => {
  expect(formatPercent(0.384)).toBe('38%');
});

describe('describeDelta', () => {
  test('an increase is good by default', () => {
    expect(describeDelta(0.22)).toEqual({ direction: 'up', text: '+22%', tone: 'positive' });
    expect(describeDelta(-0.05)).toEqual({ direction: 'down', text: '−5%', tone: 'negative' });
  });

  test('for costs, a decrease is the good direction', () => {
    expect(describeDelta(-0.3, 'down').tone).toBe('positive');
    expect(describeDelta(0.3, 'down').tone).toBe('negative');
  });

  test('no change, a change that rounds to zero, and bad input are all flat', () => {
    for (const change of [0, 0.004, -0.004, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(describeDelta(change)).toEqual({ direction: 'flat', text: '0%', tone: 'neutral' });
    }
  });

  test('large changes keep thousands separators', () => {
    expect(describeDelta(12.5).text).toBe('+1,250%');
  });
});

describe('changeFrom', () => {
  test('is the change as a fraction of the starting value', () => {
    expect(changeFrom(100, 122)).toBeCloseTo(0.22);
    expect(changeFrom(200, 150)).toBeCloseTo(-0.25);
  });

  test('is undefined with nothing to compare against', () => {
    expect(changeFrom(0, 50)).toBeUndefined();
    expect(changeFrom(Number.NaN, 50)).toBeUndefined();
  });
});

describe('contrastRatio', () => {
  test('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
  });

  test('does not depend on the order of the colors', () => {
    expect(contrastRatio('#1a1a19', '#f0efec')).toBe(contrastRatio('#f0efec', '#1a1a19'));
  });

  test('rejects anything but 6-digit hex', () => {
    expect(() => luminance('#fff')).toThrow(/6-digit hex/);
    expect(() => luminance('rgb(0, 0, 0)')).toThrow(/6-digit hex/);
  });
});

describe('formatUsd', () => {
  it('prints whole dollars under 10,000 and compact amounts above, with no padding zero', () => {
    expect(formatUsd(0)).toBe('$0');
    expect(formatUsd(950)).toBe('$950');
    expect(formatUsd(9_999)).toBe('$9,999');
    expect(formatUsd(84_000)).toBe('$84K');
    expect(formatUsd(150_000)).toBe('$150K');
    expect(formatUsd(261_500)).toBe('$261.5K');
    expect(formatUsd(1_250_000)).toBe('$1.3M');
  });
});

describe('formatDay and formatDayRange', () => {
  it('prints dates in UTC, whatever the machine’s time zone', () => {
    expect(formatDay('2026-12-15')).toBe('Dec 15, 2026');
    expect(formatDay('2027-01-01')).toBe('Jan 1, 2027');
  });

  it('prints one date for a single day and both ends otherwise', () => {
    expect(formatDayRange('2027-01-10', '2027-01-10')).toBe('Jan 10, 2027');
    expect(formatDayRange('2026-12-15', '2027-03-15')).toBe('Dec 15, 2026 – Mar 15, 2027');
  });
});
