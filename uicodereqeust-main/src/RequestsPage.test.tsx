import { fireEvent, render, screen } from '@testing-library/react';
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

function renderRequestsPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RequestsPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

test('renders both request tabs with shrink-safe sizing and switches between them', () => {
  renderRequestsPage();

  const tabList = screen.getByRole('tablist', { name: 'Filter authorization requests' });
  const actionNeeded = screen.getByRole('tab', { name: 'Action Needed' });
  const allRequests = screen.getByRole('tab', { name: 'All Requests' });

  // Mobile controls keep 44px tap targets; the list grows around them instead
  // of clipping the pills inside a fixed 44px height. Desktop sizing is retained.
  expect(tabList).toHaveClass('grid', 'grid-cols-2', 'w-full', 'h-auto', 'sm:h-11');
  expect(actionNeeded).toHaveClass('w-full', 'whitespace-nowrap', 'h-11', 'sm:h-9');
  expect(allRequests).toHaveClass('w-full', 'whitespace-nowrap', 'h-11', 'sm:h-9');
  expect(actionNeeded).toHaveAttribute('aria-selected', 'true');

  fireEvent.mouseDown(allRequests, { button: 0 });
  expect(allRequests).toHaveAttribute('aria-selected', 'true');
  expect(actionNeeded).toHaveAttribute('aria-selected', 'false');

  fireEvent.mouseDown(actionNeeded, { button: 0 });
  expect(actionNeeded).toHaveAttribute('aria-selected', 'true');
});

test('requests page mounts without crashing', () => {
  renderRequestsPage();
});
