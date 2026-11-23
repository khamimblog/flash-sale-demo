import type { FlashSaleResponse } from '@flash-sale-demo/shared-types';
import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { SaleService } from './sale.service';

@Controller('flash-sales')
export class SaleController {
  constructor(private readonly sales: SaleService) {}

  /** The sale the storefront should show: running, next upcoming, or last ended. */
  @Get('current')
  findCurrent(): Promise<FlashSaleResponse> {
    return this.sales.findCurrent();
  }

  @Get(':saleId')
  findById(@Param('saleId', ParseUUIDPipe) saleId: string): Promise<FlashSaleResponse> {
    return this.sales.findById(saleId);
  }
}
