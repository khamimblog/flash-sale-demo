import { Module } from '@nestjs/common';
import { SaleModule } from '../sale/sale.module';
import { PurchaseRequestRepository } from './purchase-request.repository';
import { PurchaseRequestStore } from './purchase-request.store';
import { PurchaseController } from './purchase.controller';
import { PurchaseService } from './purchase.service';

@Module({
  imports: [SaleModule],
  controllers: [PurchaseController],
  providers: [PurchaseService, PurchaseRequestStore, PurchaseRequestRepository],
  exports: [PurchaseService, PurchaseRequestStore],
})
export class PurchaseModule {}
