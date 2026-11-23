import type { CreatePurchaseRequestBody } from '@flash-sale-demo/shared-types';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

/**
 * User identifier (username or email). Trimmed and lower-cased so that
 * "Alice@Example.com " and "alice@example.com" count as the same buyer.
 */
export class UserIdDto implements CreatePurchaseRequestBody {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @Length(1, 254)
  userId: string;
}
