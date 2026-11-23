import type { FlashSaleResponse } from '@flash-sale-demo/shared-types';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../common/config/env.schema';
import { TtlCache } from '../../common/utils/ttl-cache';
import { deriveSaleStatus } from './sale-status';
import { SaleRepository, type FlashSaleDetails } from './sale.repository';

@Injectable()
export class SaleService {
  /**
   * Sale reads are the hottest path (every page load and every purchase attempt),
   * so each API instance caches them briefly (default 1s). With N instances the
   * database sees at most N reads per second per sale, regardless of traffic.
   */
  private readonly sales: TtlCache<FlashSaleDetails | null>;
  private readonly currentSaleId: TtlCache<string | null>;

  constructor(
    private readonly repository: SaleRepository,
    config: ConfigService<Env, true>,
  ) {
    const ttlMs = config.get('SALE_CACHE_TTL_MS', { infer: true });
    this.sales = new TtlCache(ttlMs);
    this.currentSaleId = new TtlCache(ttlMs);
  }

  /** Sale details for internal use (e.g. purchase validation). Throws 404 if unknown. */
  async getSale(id: string): Promise<FlashSaleDetails> {
    const sale = await this.sales.get(id, () => this.repository.findById(id));
    if (!sale) throw new NotFoundException('Flash sale not found');
    return sale;
  }

  async findById(id: string): Promise<FlashSaleResponse> {
    return this.toResponse(await this.getSale(id), new Date());
  }

  async findCurrent(): Promise<FlashSaleResponse> {
    const id = await this.currentSaleId.get('current', () =>
      this.repository.findCurrentId(new Date()),
    );
    if (!id) throw new NotFoundException('No flash sale is scheduled');
    return this.findById(id);
  }

  private toResponse(sale: FlashSaleDetails, now: Date): FlashSaleResponse {
    const { product } = sale;
    return {
      id: sale.id,
      status: deriveSaleStatus(sale, now),
      product: {
        id: product.id,
        name: product.name,
        description: product.description,
        imageUrl: product.imageUrl,
        price: product.price,
      },
      startsAt: sale.startsAt.toISOString(),
      endsAt: sale.endsAt.toISOString(),
      totalStock: sale.totalStock,
      remainingStock: sale.remainingStock,
      serverTime: now.toISOString(),
    };
  }
}
