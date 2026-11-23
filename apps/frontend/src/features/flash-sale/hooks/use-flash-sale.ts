import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/lib/api-client';
import { fetchCurrentSale } from '../api';

export const currentSaleQueryKey = ['flash-sale', 'current'] as const;

/** Polls the current sale so status and stock stay fresh for everyone on the page. */
export function useFlashSale() {
  return useQuery({
    queryKey: currentSaleQueryKey,
    queryFn: ({ signal }) => fetchCurrentSale(signal),
    refetchInterval: 5_000,
    // A 404 means "no sale scheduled": retrying will not help.
    retry: (failures, error) => !(error instanceof ApiError && error.status === 404) && failures < 3,
  });
}
