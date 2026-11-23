import { Controller, Param, ParseUUIDPipe, Sse, type MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { NotificationService } from './notification.service';

@Controller('flash-sales/:saleId/purchase-requests')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  /**
   * Server-Sent Events for one purchase request.
   * Events: `status` (PurchaseRequestResponse) and `heartbeat`.
   * The stream ends once the status is final; clients should then close their EventSource.
   */
  @Sse(':purchaseRequestId/events')
  events(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Param('purchaseRequestId', ParseUUIDPipe) purchaseRequestId: string,
  ): Promise<Observable<MessageEvent>> {
    return this.notifications.watch(saleId, purchaseRequestId);
  }
}
