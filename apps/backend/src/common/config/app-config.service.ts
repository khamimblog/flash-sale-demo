import { ConfigService } from '@nestjs/config';
import type { Env } from './env.schema';

/** ConfigService typed against our validated env schema. */
export type AppConfigService = ConfigService<Env, true>;
