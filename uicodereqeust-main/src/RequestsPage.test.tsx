import { render } from '@testing-library/react';
import RequestsPage from './features/dashboard/pages/RequestsPage';
import { BrowserRouter } from 'react-router-dom';

test('renders without crashing', () => {
  render(
    <BrowserRouter>
      <RequestsPage />
    </BrowserRouter>
  );
});
