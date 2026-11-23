import type { PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { UserIdDto } from './dto/user-id.dto';
import { PurchaseService } from './purchase.service';

@Controller('flash-sales/:saleId/purchase-requests')
export class PurchaseController {
  constructor(private readonly purchases: PurchaseService) {}

  /**
   * 202 Accepted: queued, follow the returned id for the result.
   * 200 OK:       this user already has a request for this sale; it is returned as-is.
   * 409 Conflict: sale not open or sold out (`PurchaseRejectedResponse`).
   */
  @Post()
  async create(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Body() { userId }: UserIdDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<PurchaseRequestResponse> {
    const { created, request } = await this.purchases.create(saleId, userId);
    reply.status(created ? HttpStatus.ACCEPTED : HttpStatus.OK);
    return request;
  }

  /** Lookup by user: answers "did this user secure an item?". */
  @Get()
  findByUser(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Query() { userId }: UserIdDto,
  ): Promise<PurchaseRequestResponse> {
    return this.purchases.findByUser(saleId, userId);
  }

  @Get(':purchaseRequestId')
  findById(
    @Param('saleId', ParseUUIDPipe) saleId: string,
    @Param('purchaseRequestId', ParseUUIDPipe) purchaseRequestId: string,
  ): Promise<PurchaseRequestResponse> {
    return this.purchases.findById(saleId, purchaseRequestId);
  }
}
