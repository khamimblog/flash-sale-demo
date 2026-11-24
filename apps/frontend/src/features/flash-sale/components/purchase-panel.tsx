import { SaleStatus } from '@flash-sale-demo/shared-types';
import { Loader2, ShoppingCart, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { PurchaseState } from '../purchase-state';
import { SALE_STATUS_META } from '../sale-status-meta';

const MAX_USER_ID_LENGTH = 254;

interface PurchasePanelProps {
  saleStatus: SaleStatus;
  purchase: PurchaseState;
  userId: string;
  onUserIdChange: (userId: string) => void;
  onBuy: (userId: string) => void;
  onCheck: (userId: string) => void;
}

export function PurchasePanel({
  saleStatus,
  purchase,
  userId,
  onUserIdChange,
  onBuy,
  onCheck,
}: PurchasePanelProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const busy = purchase.phase === 'submitting' || purchase.phase === 'pending';
  const canBuy = saleStatus === SaleStatus.ACTIVE && !busy;

  const validated = (): string | null => {
    const value = userId.trim();
    if (!value) {
      setValidationError('Please enter your username or email.');
      return null;
    }
    if (value.length > MAX_USER_ID_LENGTH) {
      setValidationError(`Please use at most ${MAX_USER_ID_LENGTH} characters.`);
      return null;
    }
    setValidationError(null);
    return value;
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const value = validated();
    if (value) onBuy(value);
  };

  const handleCheck = () => {
    const value = validated();
    if (value) onCheck(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <ShoppingCart className="size-5" aria-hidden /> Your Purchase
        </CardTitle>
        <CardDescription>
          Enter your user identifier and click &ldquo;Buy Now&rdquo; to attempt a purchase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-3">
          <Label htmlFor="user-id" className="sr-only">
            Username or email
          </Label>
          <div className="relative">
            <User
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="user-id"
              value={userId}
              onChange={(e) => onUserIdChange(e.target.value)}
              placeholder="Enter your username or email (e.g. john@example.com)"
              autoComplete="username"
              disabled={busy}
              aria-invalid={validationError ? true : undefined}
              aria-describedby={validationError ? 'user-id-error' : undefined}
              className="h-11 pl-9"
            />
          </div>
          {validationError && (
            <p id="user-id-error" className="text-sm text-destructive">
              {validationError}
            </p>
          )}

          <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={!canBuy}>
            {busy ? (
              <>
                <Loader2 className="animate-spin" aria-hidden /> Processing…
              </>
            ) : (
              <>
                <ShoppingCart aria-hidden /> {SALE_STATUS_META[saleStatus].buyLabel}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="link"
            className="h-auto w-full p-0 text-sm"
            onClick={handleCheck}
            disabled={busy}
          >
            Already tried? Check my purchase status
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
