import { Module } from '@nestjs/common';
import { ConfigModule } from '../common/config/config.module';
import { LoggerModule } from '../common/logger/logger.module';
import { DatabaseModule } from './database/database.module';
import { QueueModule } from './queue/queue.module';
import { RedisModule } from './redis/redis.module';

/** Cross-cutting infrastructure shared by both the API and worker processes. */
@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, RedisModule, QueueModule],
})
export class InfrastructureModule {}
