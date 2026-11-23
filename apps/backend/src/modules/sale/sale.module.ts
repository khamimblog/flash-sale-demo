import { Module } from '@nestjs/common';
import { SaleAvailabilityStore } from './sale-availability.store';
import { SaleController } from './sale.controller';
import { SaleRepository } from './sale.repository';
import { SaleService } from './sale.service';

@Module({
  controllers: [SaleController],
  providers: [SaleRepository, SaleService, SaleAvailabilityStore],
  exports: [SaleService, SaleAvailabilityStore],
})
export class SaleModule {}
