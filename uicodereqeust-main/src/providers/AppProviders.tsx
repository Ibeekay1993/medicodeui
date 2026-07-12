import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ReactNode } from "react";

/**
 * Singleton QueryClient instance.
 * Exported so it can be used in tests, utility functions,
 * and cache imperative updates (e.g. queryClient.invalidateQueries).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 60 * 1000, // 1 minute caching for all queries
      gcTime: 10 * 60 * 1000, // 10 minutes garbage collection
    },
  },
});

interface AppProvidersProps {
  children: ReactNode;
}

/**
 * AppProviders wraps the entire application with all global context providers.
 * The order matters: QueryClient → TooltipProvider → Router → Auth.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            {children}
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
