import { Module } from '@nestjs/common';
import { SaleModule } from '../sale/sale.module';
import { FulfillmentRepository } from './fulfillment.repository';
import { FulfillmentService } from './fulfillment.service';
import { PurchaseRequestConsumer } from './purchase-request.consumer';

@Module({
  imports: [SaleModule],
  providers: [FulfillmentRepository, FulfillmentService, PurchaseRequestConsumer],
})
export class FulfillmentModule {}
