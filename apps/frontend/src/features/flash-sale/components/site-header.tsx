import type { SaleStatus } from '@flash-sale-demo/shared-types';
import { Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SALE_STATUS_META } from '../sale-status-meta';

export function SiteHeader({ status }: { status?: SaleStatus }) {
  const meta = status ? SALE_STATUS_META[status] : undefined;

  return (
    <header className="flex items-center justify-between gap-4 bg-[#1e1b4b] px-5 py-4 text-white sm:px-8">
      <div className="flex items-center gap-3">
        <Zap className="size-7 fill-amber-400 text-amber-400" aria-hidden />
        <span className="text-lg font-semibold tracking-tight sm:text-xl">Flash Sale Demo</span>
      </div>
      {meta && (
        <span className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium">
          <span className={cn('size-2.5 rounded-full', meta.dotClass)} aria-hidden />
          {meta.label}
        </span>
      )}
    </header>
  );
}
