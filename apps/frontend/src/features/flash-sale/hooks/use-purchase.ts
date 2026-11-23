import { PurchaseStatus, type PurchaseRequestResponse } from '@flash-sale-demo/shared-types';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api-client';
import { createPurchaseRequest, findPurchaseRequestByUser } from '../api';
import { isFinalStatus, watchPurchaseRequest } from '../purchase-events';
import type { PurchaseState } from '../purchase-state';
import { currentSaleQueryKey } from './use-flash-sale';

const toState = (request: PurchaseRequestResponse, existing: boolean): PurchaseState =>
  isFinalStatus(request.status)
    ? { phase: 'settled', request, existing }
    : { phase: 'pending', request, existing };

function toErrorState(error: unknown): PurchaseState {
  if (error instanceof ApiError && error.status === 409) {
    const status = (error.body as { status?: string } | null)?.status;
    if (status === PurchaseStatus.SOLD_OUT || status === PurchaseStatus.SALE_NOT_ACTIVE) {
      return { phase: 'rejected', status };
    }
  }
  if (error instanceof ApiError && error.status === 400) {
    return { phase: 'error', message: 'Please enter a valid username or email.' };
  }
  return { phase: 'error', message: 'The service is busy. Please try again in a moment.' };
}

/**
 * Purchase flow for one sale: submit, then follow the queued request via SSE
 * until the worker's decision arrives.
 */
export function usePurchase(saleId: string | undefined) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<PurchaseState>({ phase: 'idle' });

  const pendingId = state.phase === 'pending' ? state.request.purchaseRequestId : null;
  const pendingExisting = state.phase === 'pending' && state.existing;

  // While a request is pending, follow it until it is final.
  useEffect(() => {
    if (!saleId || !pendingId) return;
    return watchPurchaseRequest(saleId, pendingId, (request) => {
      setState(toState(request, pendingExisting));
      if (isFinalStatus(request.status)) {
        void queryClient.invalidateQueries({ queryKey: currentSaleQueryKey });
      }
    });
  }, [saleId, pendingId, pendingExisting, queryClient]);

  const buy = useCallback(
    async (userId: string) => {
      if (!saleId) return;
      setState({ phase: 'submitting' });
      try {
        const { request, existing } = await createPurchaseRequest(saleId, userId);
        setState(toState(request, existing));
      } catch (error) {
        setState(toErrorState(error));
      }
    },
    [saleId],
  );

  /** Looks up this user's earlier attempt (also used to resume after a page reload). */
  const check = useCallback(
    async (userId: string) => {
      if (!saleId) return;
      setState({ phase: 'submitting' });
      try {
        const request = await findPurchaseRequestByUser(saleId, userId);
        setState(request ? toState(request, true) : { phase: 'not-found' });
      } catch (error) {
        setState(toErrorState(error));
      }
    },
    [saleId],
  );

  /** Like `check`, but silent: on page load, only show something if there is a request. */
  const resume = useCallback(
    async (userId: string) => {
      if (!saleId) return;
      const request = await findPurchaseRequestByUser(saleId, userId).catch(() => null);
      if (request) setState((current) => (current.phase === 'idle' ? toState(request, true) : current));
    },
    [saleId],
  );

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  return { state, buy, check, resume, reset };
}
