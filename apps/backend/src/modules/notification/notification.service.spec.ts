import { randomUUID } from 'node:crypto';
import {
  PurchaseStatus,
  type PurchaseRequestResponse,
  type PurchaseStatus as Status,
} from '@flash-sale-demo/shared-types';
import type { MessageEvent } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { Subject, lastValueFrom, toArray } from 'rxjs';
import type { PurchaseRequestStore } from '../purchase/purchase-request.store';
import type { PurchaseService } from '../purchase/purchase.service';
import { NotificationService } from './notification.service';
import type { PurchaseUpdatesBus } from './purchase-updates.bus';

const SALE_ID = randomUUID();
const REQUEST_ID = randomUUID();

const request = (status: Status, id = REQUEST_ID): PurchaseRequestResponse => ({
  purchaseRequestId: id,
  flashSaleId: SALE_ID,
  userId: 'alice',
  status,
  updatedAt: new Date().toISOString(),
});

function setup() {
  const updates = new Subject<PurchaseRequestResponse>();
  const purchases = { findById: jest.fn() } as unknown as jest.Mocked<PurchaseService>;
  const store = { save: jest.fn() } as unknown as jest.Mocked<PurchaseRequestStore>;
  const bus = {
    updates$: updates.asObservable(),
    publish: jest.fn(),
  } as unknown as jest.Mocked<PurchaseUpdatesBus>;
  const service = new NotificationService(purchases, store, bus);
  return { service, purchases, store, bus, updates };
}

const statuses = (events: MessageEvent[]) =>
  events
    .filter((e) => e.type === 'status')
    .map((e) => (e.data as PurchaseRequestResponse).status);

describe('NotificationService', () => {
  describe('handleResult', () => {
    it('stores the final status, then publishes it to all instances', async () => {
      const { service, store, bus } = setup();

      await service.handleResult({
        purchaseRequestId: REQUEST_ID,
        flashSaleId: SALE_ID,
        userId: 'alice',
        status: PurchaseStatus.SUCCESS,
        processedAt: new Date().toISOString(),
      });

      const expected = expect.objectContaining({
        purchaseRequestId: REQUEST_ID,
        status: PurchaseStatus.SUCCESS,
      });
      expect(store.save).toHaveBeenCalledWith(expected);
      expect(bus.publish).toHaveBeenCalledWith(expected);
      expect(store.save.mock.invocationCallOrder[0]).toBeLessThan(
        bus.publish.mock.invocationCallOrder[0],
      );
    });

    it('rejects malformed results so they are retried and dead-lettered', async () => {
      const { service, store } = setup();

      await expect(service.handleResult({ status: 'NOPE' })).rejects.toThrow();
      expect(store.save).not.toHaveBeenCalled();
    });
  });

  describe('watch', () => {
    it('emits a final status once and completes', async () => {
      const { service, purchases } = setup();
      purchases.findById.mockResolvedValue(request(PurchaseStatus.SUCCESS));

      const events = await lastValueFrom((await service.watch(SALE_ID, REQUEST_ID)).pipe(toArray()));

      expect(statuses(events)).toEqual([PurchaseStatus.SUCCESS]);
    });

    it('emits the current status, then the final update, then completes', async () => {
      const { service, purchases, updates } = setup();
      purchases.findById.mockResolvedValue(request(PurchaseStatus.PENDING));

      const stream = await service.watch(SALE_ID, REQUEST_ID);
      const collected = lastValueFrom(stream.pipe(toArray()));
      await Promise.resolve(); // let the re-read settle
      updates.next(request(PurchaseStatus.SUCCESS, randomUUID())); // someone else's update
      updates.next(request(PurchaseStatus.SUCCESS));

      expect(statuses(await collected)).toEqual([PurchaseStatus.PENDING, PurchaseStatus.SUCCESS]);
    });

    it('catches a result that landed between the first read and subscribing', async () => {
      const { service, purchases } = setup();
      purchases.findById
        .mockResolvedValueOnce(request(PurchaseStatus.PENDING))
        .mockResolvedValueOnce(request(PurchaseStatus.SOLD_OUT));

      const events = await lastValueFrom((await service.watch(SALE_ID, REQUEST_ID)).pipe(toArray()));

      expect(statuses(events)).toEqual([PurchaseStatus.PENDING, PurchaseStatus.SOLD_OUT]);
    });

    it('sends heartbeats while pending and closes after the maximum duration', async () => {
      jest.useFakeTimers();
      try {
        const { service, purchases } = setup();
        purchases.findById.mockResolvedValue(request(PurchaseStatus.PENDING));

        const events: MessageEvent[] = [];
        let completed = false;
        (await service.watch(SALE_ID, REQUEST_ID)).subscribe({
          next: (e) => events.push(e),
          complete: () => (completed = true),
        });

        await jest.advanceTimersByTimeAsync(59_999);
        expect(events.filter((e) => e.type === 'heartbeat')).toHaveLength(3);
        expect(completed).toBe(false);

        await jest.advanceTimersByTimeAsync(1);
        expect(completed).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('fails with 404 before opening a stream for an unknown request', async () => {
      const { service, purchases } = setup();
      purchases.findById.mockRejectedValue(new NotFoundException());

      await expect(service.watch(SALE_ID, REQUEST_ID)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
