import { Inject, Injectable } from '@nestjs/common';
import { asc, desc, eq, gt } from 'drizzle-orm';
import { DATABASE, type Database } from '../../infrastructure/database/database.tokens';
import { flashSales, products, type Product } from '../../infrastructure/database/schema';

export interface FlashSaleDetails {
  id: string;
  startsAt: Date;
  endsAt: Date;
  totalStock: number;
  remainingStock: number;
  product: Product;
}

@Injectable()
export class SaleRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async findById(id: string): Promise<FlashSaleDetails | null> {
    const [row] = await this.db
      .select({
        id: flashSales.id,
        startsAt: flashSales.startsAt,
        endsAt: flashSales.endsAt,
        totalStock: flashSales.totalStock,
        remainingStock: flashSales.remainingStock,
        product: products,
      })
      .from(flashSales)
      .innerJoin(products, eq(products.id, flashSales.productId))
      .where(eq(flashSales.id, id));
    return row ?? null;
  }

  /** The running or next upcoming sale; otherwise the most recently ended one. */
  async findCurrentId(now: Date): Promise<string | null> {
    const [next] = await this.db
      .select({ id: flashSales.id })
      .from(flashSales)
      .where(gt(flashSales.endsAt, now))
      .orderBy(asc(flashSales.startsAt))
      .limit(1);
    if (next) return next.id;

    const [last] = await this.db
      .select({ id: flashSales.id })
      .from(flashSales)
      .orderBy(desc(flashSales.endsAt))
      .limit(1);
    return last?.id ?? null;
  }
}
