import { Check, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatSalePeriod } from '@/lib/format';
import type { FlashSale } from '../api';

export function SaleDetails({ sale }: { sale: FlashSale }) {
  const rules = [
    'One item per user',
    `Limited stock: ${sale.totalStock.toLocaleString()} units`,
    `Sale period: ${formatSalePeriod(sale.startsAt, sale.endsAt)}`,
  ];

  return (
    <Card className="bg-violet-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Info className="size-5 text-primary" aria-hidden /> About This Sale
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {rules.map((rule) => (
            <li key={rule} className="flex items-start gap-3">
              <Check className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
