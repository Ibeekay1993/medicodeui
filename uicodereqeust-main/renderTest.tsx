import { renderToString } from 'react-dom/server';
import React from 'react';
import RequestsPage from './src/pages/dashboard/RequestsPage';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

try {
  renderToString(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <RequestsPage />
      </BrowserRouter>
    </QueryClientProvider>
  );
  console.log("Rendered successfully");
} catch (e) {
  console.error("Render failed with error:", e);
}
