import { render } from '@testing-library/react';

import { DashboardLayout } from './components/dashboard/DashboardLayout';
import { BrowserRouter } from 'react-router-dom';

test('renders dashboard layout without crashing', () => {
  render(
    <BrowserRouter>
      <DashboardLayout />
    </BrowserRouter>
  );
});
