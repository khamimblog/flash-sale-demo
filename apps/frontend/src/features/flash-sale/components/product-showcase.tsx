import { Package } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatPrice } from '@/lib/format';
import type { FlashSale } from '../api';

export function ProductImage({ sale }: { sale: FlashSale }) {
  const { product } = sale;
  return (
    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-violet-100">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} className="size-full object-cover" />
      ) : (
        <Package className="size-20 text-violet-400" aria-hidden />
      )}
    </div>
  );
}

export function ProductSummary({ sale }: { sale: FlashSale }) {
  const { product } = sale;
  return (
    <div className="space-y-3">
      <Badge className="rounded-full bg-primary px-3 py-1 text-sm">Flash Sale</Badge>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{product.name}</h1>
      {product.description && <p className="text-muted-foreground">{product.description}</p>}
      <p className="text-2xl font-semibold text-primary">{formatPrice(product.price)}</p>
    </div>
  );
}
