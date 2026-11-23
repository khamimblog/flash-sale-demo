import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { describe, expect, it } from 'vitest';
import { describePurchase } from './purchase-state';

const request = (status: PurchaseStatus): PurchaseRequestResponse => ({
  purchaseRequestId: 'r1',
  flashSaleId: 's1',
  userId: 'alice',
  status,
  updatedAt: '2026-11-23T10:00:00Z',
});

describe('describePurchase', () => {
  it('says nothing while idle or submitting', () => {
    expect(describePurchase({ phase: 'idle' })).toBeNull();
    expect(describePurchase({ phase: 'submitting' })).toBeNull();
  });

  it('tells a queued user to wait', () => {
    const feedback = describePurchase({
      phase: 'pending',
      request: request(PurchaseStatus.PENDING),
      existing: false,
    });
    expect(feedback).toMatchObject({ tone: 'info', title: "You're in the queue" });
  });

  it.each([
    [PurchaseStatus.SUCCESS, 'success', 'Purchase successful!'],
    [PurchaseStatus.ALREADY_PURCHASED, 'warning', 'Already purchased'],
    [PurchaseStatus.SOLD_OUT, 'error', 'Sold out'],
    [PurchaseStatus.SALE_NOT_ACTIVE, 'warning', 'Sale not active'],
    [PurchaseStatus.FAILED, 'error', 'Something went wrong'],
  ] as const)('describes a settled %s result', (status, tone, title) => {
    expect(
      describePurchase({ phase: 'settled', request: request(status), existing: false }),
    ).toMatchObject({ tone, title });
  });

  it('tells a returning buyer they already have their item', () => {
    expect(
      describePurchase({
        phase: 'settled',
        request: request(PurchaseStatus.SUCCESS),
        existing: true,
      }),
    ).toMatchObject({ tone: 'success', title: 'You already secured an item' });
  });

  it('describes up-front rejections like the matching worker result', () => {
    expect(describePurchase({ phase: 'rejected', status: PurchaseStatus.SOLD_OUT })).toMatchObject({
      title: 'Sold out',
    });
  });
});
