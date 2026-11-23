import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { FlashSalePage } from '@/features/flash-sale/flash-sale-page';

export default function App() {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <FlashSalePage />
    </QueryClientProvider>
  );
}
