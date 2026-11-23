import { Progress } from '@/components/ui/progress';

export function StockMeter({ remaining, total }: { remaining: number; total: number }) {
  const percentLeft = total > 0 ? Math.round((remaining / total) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="font-medium">
          {remaining.toLocaleString()} / {total.toLocaleString()} left
        </span>
        <span className="text-muted-foreground">Updates every few seconds</span>
      </div>
      <Progress value={percentLeft} aria-label="Stock remaining" />
    </div>
  );
}
