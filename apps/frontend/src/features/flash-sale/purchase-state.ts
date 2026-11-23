import {
  PurchaseStatus,
  type PurchaseRejectedResponse,
  type PurchaseRequestResponse,
} from '@flash-sale-demo/shared-types';

/** Everything the purchase panel can be showing. */
export type PurchaseState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  /** Queued; waiting for the worker's decision. `existing`: it was an earlier request. */
  | { phase: 'pending'; request: PurchaseRequestResponse; existing: boolean }
  | { phase: 'settled'; request: PurchaseRequestResponse; existing: boolean }
  /** Rejected by the API before queueing (409). */
  | { phase: 'rejected'; status: PurchaseRejectedResponse['status'] }
  /** "Check my purchase" found nothing for this user. */
  | { phase: 'not-found' }
  | { phase: 'error'; message: string };

export type FeedbackTone = 'info' | 'success' | 'warning' | 'error';

export interface Feedback {
  tone: FeedbackTone;
  title: string;
  description: string;
}

const STATUS_FEEDBACK: Record<Exclude<PurchaseStatus, 'PENDING'>, Feedback> = {
  [PurchaseStatus.SUCCESS]: {
    tone: 'success',
    title: 'Purchase successful!',
    description: 'Congratulations! You have secured 1 item.',
  },
  [PurchaseStatus.ALREADY_PURCHASED]: {
    tone: 'warning',
    title: 'Already purchased',
    description: 'Each user can buy only one item, and you already have yours.',
  },
  [PurchaseStatus.SOLD_OUT]: {
    tone: 'error',
    title: 'Sold out',
    description: 'Sorry, every item has been claimed.',
  },
  [PurchaseStatus.SALE_NOT_ACTIVE]: {
    tone: 'warning',
    title: 'Sale not active',
    description: 'The sale has not started yet or has already ended.',
  },
  [PurchaseStatus.FAILED]: {
    tone: 'error',
    title: 'Something went wrong',
    description: 'We could not complete your purchase. Please try again.',
  },
};

/** User-facing message for the current purchase state, or null when there is nothing to say. */
export function describePurchase(state: PurchaseState): Feedback | null {
  switch (state.phase) {
    case 'idle':
    case 'submitting':
      return null;
    case 'pending':
      return {
        tone: 'info',
        title: "You're in the queue",
        description: 'We are confirming your order. This usually takes a moment.',
      };
    case 'settled':
      if (state.existing && state.request.status === PurchaseStatus.SUCCESS) {
        return {
          tone: 'success',
          title: 'You already secured an item',
          description: 'Each user can buy only one item, and yours is confirmed.',
        };
      }
      return STATUS_FEEDBACK[state.request.status as Exclude<PurchaseStatus, 'PENDING'>];
    case 'rejected':
      return STATUS_FEEDBACK[state.status];
    case 'not-found':
      return {
        tone: 'info',
        title: 'No purchase yet',
        description: 'We could not find a purchase attempt for this user.',
      };
    case 'error':
      return { tone: 'error', title: 'Could not place your order', description: state.message };
  }
}
