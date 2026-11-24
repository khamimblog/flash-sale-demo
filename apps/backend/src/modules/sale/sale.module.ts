import { Module } from '@nestjs/common';
import { SaleStockCounter } from './sale-stock-counter';
import { SaleController } from './sale.controller';
import { SaleRepository } from './sale.repository';
import { SaleService } from './sale.service';

@Module({
  controllers: [SaleController],
  providers: [SaleRepository, SaleService, SaleStockCounter],
  exports: [SaleService, SaleStockCounter],
})
export class SaleModule {}
