import { Module } from '@nestjs/common';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';

/**
 * Background process: consumes purchase requests from the queue,
 * runs the inventory transaction and publishes results.
 */
@Module({
  imports: [InfrastructureModule, FulfillmentModule],
})
export class WorkerModule {}
