import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { DATABASE, type Database } from '../../infrastructure/database/database.tokens';
import { REDIS } from '../../infrastructure/redis/redis.tokens';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Liveness: the process is up. Used by orchestrators to decide on restarts. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Readiness: dependencies are reachable. Used by load balancers to route traffic. */
  @Get('ready')
  async ready() {
    const [database, redis] = await Promise.all([
      this.check(() => this.db.execute(sql`select 1`)),
      this.check(() => this.redis.ping()),
    ]);
    const body = { status: database && redis ? 'ok' : 'error', database, redis };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }

  private async check(probe: () => Promise<unknown>): Promise<boolean> {
    try {
      await probe();
      return true;
    } catch {
      return false;
    }
  }
}
