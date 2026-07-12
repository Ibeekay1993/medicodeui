import { render } from '@testing-library/react';
import RequestsPage from './features/dashboard/pages/RequestsPage';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

test('renders without crashing', () => {
  const queryClient = createTestQueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RequestsPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
});
