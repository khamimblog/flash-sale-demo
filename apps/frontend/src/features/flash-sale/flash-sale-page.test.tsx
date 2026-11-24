import {
  PurchaseStatus,
  SaleStatus,
  type FlashSaleResponse,
  type PurchaseRequestResponse,
} from '@flash-sale-demo/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlashSalePage } from './flash-sale-page';

const SALE_ID = '11111111-1111-4111-8111-111111111111';

function makeSale(overrides: Partial<FlashSaleResponse> = {}): FlashSaleResponse {
  const now = Date.now();
  return {
    id: SALE_ID,
    status: SaleStatus.ACTIVE,
    product: {
      id: 'p1',
      name: 'Aurora Wireless Earbuds',
      description: 'Limited edition.',
      imageUrl: null,
      price: '79.00',
    },
    startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 300_000).toISOString(),
    totalStock: 1000,
    remainingStock: 1000,
    serverTime: new Date(now).toISOString(),
    ...overrides,
  };
}

const pendingRequest = (userId = 'alice'): PurchaseRequestResponse => ({
  purchaseRequestId: '22222222-2222-4222-8222-222222222222',
  flashSaleId: SALE_ID,
  userId,
  status: PurchaseStatus.PENDING,
  updatedAt: new Date().toISOString(),
});

/** Minimal EventSource stand-in the test can push events through. */
class FakeEventSource {
  static readonly CLOSED = 2;
  static instances: FakeEventSource[] = [];
  readonly url: string;
  readyState = 1;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  emit(type: string, data: unknown) {
    this.listeners.get(type)?.forEach((listener) => listener({ data: JSON.stringify(data) }));
  }
  close() {
    this.readyState = FakeEventSource.CLOSED;
  }
}

type Route = { status: number; body: unknown };

/** Routes fetch calls by "METHOD path" (query string ignored). */
function mockApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).split('?')[0];
    const route = routes[`${init?.method ?? 'GET'} ${path}`] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(route.body), { status: route.status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <FlashSalePage />
    </QueryClientProvider>,
  );
}

const purchasePath = `/api/flash-sales/${SALE_ID}/purchase-requests`;

describe('FlashSalePage', () => {
  beforeEach(() => {
    localStorage.clear();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows the active sale with stock and countdown', async () => {
    mockApi({ 'GET /api/flash-sales/current': { status: 200, body: makeSale({ remainingStock: 312 }) } });

    renderPage();

    expect(await screen.findByRole('heading', { name: 'Aurora Wireless Earbuds' })).toBeVisible();
    expect(screen.getByText('312 / 1,000 left')).toBeVisible();
    expect(screen.getByRole('timer')).toBeVisible();
    expect(screen.getByRole('button', { name: /buy now/i })).toBeEnabled();
  });

  it('queues the purchase, then shows success when the result arrives over SSE', async () => {
    mockApi({
      'GET /api/flash-sales/current': { status: 200, body: makeSale() },
      [`POST ${purchasePath}`]: { status: 202, body: pendingRequest() },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/username or email/i), 'alice');
    await user.click(screen.getByRole('button', { name: /buy now/i }));

    expect(await screen.findByText("You're in the queue")).toBeVisible();
    expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled();
    expect(screen.getByLabelText(/username or email/i)).toBeDisabled();
    const stream = FakeEventSource.instances[0];
    expect(stream.url).toBe(`${purchasePath}/${pendingRequest().purchaseRequestId}/events`);

    act(() => stream.emit('status', { ...pendingRequest(), status: PurchaseStatus.SUCCESS }));

    expect(await screen.findByText('Purchase successful!')).toBeVisible();
    expect(stream.readyState).toBe(FakeEventSource.CLOSED);
    expect(screen.getByLabelText(/username or email/i)).toBeEnabled();
  });

  it('tells the user when the sale is sold out', async () => {
    mockApi({
      'GET /api/flash-sales/current': { status: 200, body: makeSale() },
      [`POST ${purchasePath}`]: {
        status: 409,
        body: { status: PurchaseStatus.SOLD_OUT, message: 'The sale is sold out' },
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/username or email/i), 'bob');
    await user.click(screen.getByRole('button', { name: /buy now/i }));

    expect(await screen.findByText('Sold out')).toBeVisible();
  });

  it('tells a returning buyer they already have their item', async () => {
    mockApi({
      'GET /api/flash-sales/current': { status: 200, body: makeSale() },
      [`POST ${purchasePath}`]: {
        status: 200,
        body: { ...pendingRequest(), status: PurchaseStatus.SUCCESS },
      },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText(/username or email/i), 'alice');
    await user.click(screen.getByRole('button', { name: /buy now/i }));

    expect(await screen.findByText('You already secured an item')).toBeVisible();
  });

  it('validates the user identifier before calling the API', async () => {
    const fetchMock = mockApi({
      'GET /api/flash-sales/current': { status: 200, body: makeSale() },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: /buy now/i }));

    expect(screen.getByText('Please enter your username or email.')).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalledWith(purchasePath, expect.anything());
  });

  it('disables buying before the sale starts', async () => {
    const now = Date.now();
    mockApi({
      'GET /api/flash-sales/current': {
        status: 200,
        body: makeSale({
          status: SaleStatus.UPCOMING,
          startsAt: new Date(now + 60_000).toISOString(),
          endsAt: new Date(now + 360_000).toISOString(),
        }),
      },
    });

    renderPage();

    expect(await screen.findByRole('button', { name: /sale starts soon/i })).toBeDisabled();
    expect(screen.getByText('Sale starts in:')).toBeVisible();
  });

  it('explains when no sale is scheduled', async () => {
    mockApi({});

    renderPage();

    expect(await screen.findByText('No flash sale is scheduled')).toBeVisible();
  });
});
