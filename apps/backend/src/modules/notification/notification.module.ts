import { Module } from '@nestjs/common';
import { PurchaseModule } from '../purchase/purchase.module';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { PurchaseResultConsumer } from './purchase-result.consumer';
import { PurchaseUpdatesBus } from './purchase-updates.bus';

/**
 * Runs inside the API process for now. It only depends on the results queue and
 * Redis, so it can be extracted into its own service without code changes.
 */
@Module({
  imports: [PurchaseModule],
  controllers: [NotificationController],
  providers: [NotificationService, PurchaseUpdatesBus, PurchaseResultConsumer],
})
export class NotificationModule {}
