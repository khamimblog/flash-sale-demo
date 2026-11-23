import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PurchaseModule } from './modules/purchase/purchase.module';
import { SaleModule } from './modules/sale/sale.module';

/**
 * HTTP process: accepts purchase requests, serves sale/purchase status
 * and streams purchase results to clients (SSE).
 */
@Module({
  imports: [InfrastructureModule, HealthModule, SaleModule, PurchaseModule, NotificationModule],
})
export class ApiModule {}
