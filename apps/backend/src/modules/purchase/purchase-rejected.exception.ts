import type { PurchaseRejectedResponse } from '@flash-sale-demo/shared-types';
import { ConflictException } from '@nestjs/common';

/** 409: the purchase cannot be accepted given the sale's current state. */
export class PurchaseRejectedException extends ConflictException {
  constructor(status: PurchaseRejectedResponse['status'], message: string) {
    super({ status, message } satisfies PurchaseRejectedResponse);
  }
}
