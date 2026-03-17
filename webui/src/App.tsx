import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import Lottie from 'lottie-react';
import cocoonAnim from './assets/cocoon.json';
import Layout from './components/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import SetupWizard from './pages/setup/SetupWizard';
import Dashboard from './pages/Dashboard';
import ChatContainer from './pages/ChatContainer';
import WalletPage from './pages/WalletPage';
import { SSEProvider } from './hooks/useSSEContext';
import { setupApi } from './lib/api';
import { QK } from './lib/queryKeys';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});

function AppRoutes() {
  const { data: setupStatus, isLoading } = useQuery({
    queryKey: QK.setupStatus,
    queryFn: setupApi.getStatus,
    staleTime: 30_000,
  });

  if (isLoading) return (
    <div className="flex h-screen items-center justify-center bg-[var(--bg)]">
      <Lottie animationData={cocoonAnim} loop className="h-16 w-16" />
    </div>
  );

  const setupDone = setupStatus?.hasWallet === true && setupStatus?.hasConfig === true;

  return (
    <Layout setupDone={setupDone}>
      <Routes>
        {setupDone ? (
          <>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/chat" element={<ChatContainer />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </>
        ) : (
          <>
            <Route path="/setup" element={<SetupWizard />} />
            <Route path="*" element={<Navigate to="/setup" replace />} />
          </>
        )}
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <SSEProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </SSEProvider>
      </ErrorBoundary>
    </QueryClientProvider>
  );
}
