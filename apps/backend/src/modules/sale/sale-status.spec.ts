import { SaleStatus } from '@flash-sale-demo/shared-types';
import { deriveSaleStatus, isWithinWindow } from './sale-status';

const startsAt = new Date('2026-11-23T10:00:00Z');
const endsAt = new Date('2026-11-23T10:05:00Z');
const at = (iso: string) => new Date(iso);

describe('isWithinWindow', () => {
  it.each([
    ['1ms before start', '2026-11-23T09:59:59.999Z', false],
    ['exactly at start', '2026-11-23T10:00:00.000Z', true],
    ['during the sale', '2026-11-23T10:02:30.000Z', true],
    ['1ms before end', '2026-11-23T10:04:59.999Z', true],
    ['exactly at end', '2026-11-23T10:05:00.000Z', false],
  ])('%s → %s', (_label, iso, expected) => {
    expect(isWithinWindow({ startsAt, endsAt }, at(iso))).toBe(expected);
  });
});

describe('deriveSaleStatus', () => {
  const sale = (remainingStock: number) => ({ startsAt, endsAt, remainingStock });

  it('is UPCOMING before the start', () => {
    expect(deriveSaleStatus(sale(10), at('2026-11-23T09:00:00Z'))).toBe(SaleStatus.UPCOMING);
  });

  it('is ACTIVE during the window with stock left', () => {
    expect(deriveSaleStatus(sale(10), at('2026-11-23T10:01:00Z'))).toBe(SaleStatus.ACTIVE);
  });

  it('is SOLD_OUT during the window with no stock', () => {
    expect(deriveSaleStatus(sale(0), at('2026-11-23T10:01:00Z'))).toBe(SaleStatus.SOLD_OUT);
  });

  it('is ENDED after the window, even if stock is gone', () => {
    expect(deriveSaleStatus(sale(0), at('2026-11-23T10:06:00Z'))).toBe(SaleStatus.ENDED);
  });
});
