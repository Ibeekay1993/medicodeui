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

  expect(tabList).toHaveClass('w-full', 'min-w-0', 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
  expect(actionNeeded).toHaveClass('min-w-0', 'whitespace-normal', 'break-words');
  expect(allRequests).toHaveClass('min-w-0', 'whitespace-normal', 'break-words');
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
