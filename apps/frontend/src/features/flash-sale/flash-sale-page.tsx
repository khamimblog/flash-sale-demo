import { SaleStatus } from '@flash-sale-demo/shared-types';
import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api-client';
import { safeStorage } from '@/lib/storage';
import type { FlashSale } from './api';
import { ProductImage, ProductSummary } from './components/product-showcase';
import { PurchaseFeedback } from './components/purchase-feedback';
import { PurchasePanel } from './components/purchase-panel';
import { SaleDetails } from './components/sale-details';
import { SaleTimer } from './components/sale-timer';
import { SiteFooter } from './components/site-footer';
import { SiteHeader } from './components/site-header';
import { StockMeter } from './components/stock-meter';
import { useFlashSale } from './hooks/use-flash-sale';
import { usePurchase } from './hooks/use-purchase';
import { useServerNow } from './hooks/use-server-now';

const USER_ID_STORAGE_KEY = 'flash-sale-demo:user-id';

export function FlashSalePage() {
  const { data: sale, error, isPending } = useFlashSale();

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:py-10">
      <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
        <SiteHeader status={sale?.status} />
        <main className="space-y-6 p-4 sm:p-8">
          {sale ? (
            <SaleContent sale={sale} />
          ) : isPending ? (
            <LoadingState />
          ) : (
            <ErrorState error={error} />
          )}
          <SiteFooter />
        </main>
      </div>
    </div>
  );
}

function SaleContent({ sale }: { sale: FlashSale }) {
  const now = useServerNow(sale.clockOffsetMs);
  const { refetch } = useFlashSale();
  const { state, buy, check, resume, reset } = usePurchase(sale.id);
  const [userId, setUserId] = useState(() => safeStorage.get(USER_ID_STORAGE_KEY) ?? '');

  // Returning visitor: show the result of their earlier attempt (and resume a pending one).
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const remembered = safeStorage.get(USER_ID_STORAGE_KEY);
    if (remembered) void resume(remembered);
  }, [resume]);

  // Status changes at the countdown boundaries; refresh instead of waiting for the next poll.
  const boundary =
    sale.status === SaleStatus.UPCOMING
      ? Date.parse(sale.startsAt)
      : sale.status === SaleStatus.ACTIVE
        ? Date.parse(sale.endsAt)
        : null;
  const boundaryPassed = boundary !== null && now >= boundary;
  useEffect(() => {
    if (boundaryPassed) void refetch();
  }, [boundaryPassed, refetch]);

  const remember = (value: string) => safeStorage.set(USER_ID_STORAGE_KEY, value);

  return (
    <>
      <section className="grid gap-6 md:grid-cols-[2fr_3fr] md:items-center">
        <ProductImage sale={sale} />
        <div className="space-y-5">
          <ProductSummary sale={sale} />
          <SaleTimer sale={sale} now={now} />
          <StockMeter remaining={sale.remainingStock} total={sale.totalStock} />
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <PurchasePanel
          saleStatus={sale.status}
          purchase={state}
          userId={userId}
          onUserIdChange={(value) => {
            setUserId(value);
            // A different user must not see the previous user's result.
            if (state.phase !== 'idle') reset();
          }}
          onBuy={(value) => {
            remember(value);
            void buy(value);
          }}
          onCheck={(value) => {
            remember(value);
            void check(value);
          }}
        />
        <SaleDetails sale={sale} />
      </section>

      <PurchaseFeedback state={state} />
    </>
  );
}

function LoadingState() {
  return (
    <div className="grid gap-6 md:grid-cols-[2fr_3fr]" aria-busy="true" aria-label="Loading sale">
      <Skeleton className="aspect-[4/3] rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-28 rounded-full" />
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  );
}

function ErrorState({ error }: { error: unknown }) {
  const noSale = error instanceof ApiError && error.status === 404;
  return (
    <div className="py-16 text-center">
      <p className="text-xl font-semibold">
        {noSale ? 'No flash sale is scheduled' : 'We could not load the sale'}
      </p>
      <p className="mt-2 text-muted-foreground">
        {noSale ? 'Check back soon!' : 'Please refresh the page in a moment.'}
      </p>
    </div>
  );
}
