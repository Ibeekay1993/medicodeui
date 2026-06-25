import '@testing-library/jest-dom';
import { vi } from 'vitest';

const makeChain = () => {
  const chain: any = {};
  const methods = [
    'select', 'eq', 'neq', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike',
    'is', 'in', 'contains', 'containedBy', 'rangeLt', 'rangeGt', 'rangeGte',
    'rangeLte', 'rangeAdjacent', 'overlaps', 'textSearch', 'match', 'not',
    'or', 'filter', 'order', 'limit', 'range', 'single', 'maybeSingle',
    'insert', 'update', 'upsert', 'delete'
  ];
  methods.forEach(method => {
    chain[method] = vi.fn(() => chain);
  });
  // Make the chain thenable so it resolves like a promise
  chain.then = (onfulfilled: any) => Promise.resolve({ data: null, error: null }).then(onfulfilled);
  return chain;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => makeChain()),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn().mockResolvedValue({}),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
  }
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test' }, role: 'utilization_manager' }),
  AuthProvider: ({ children }: any) => children
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
