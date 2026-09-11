import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App.tsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

const application = (
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
);

async function startApplication() {
  let googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  if (!googleClientId) {
    try {
      const response = await fetch('/api/auth/config');
      if (response.ok) {
        const config = (await response.json()) as { googleClientId?: string | null };
        googleClientId = config.googleClientId || undefined;
      }
    } catch {
      // The app keeps working without Google sign-in when runtime config is unavailable.
    }
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>{application}</GoogleOAuthProvider>
      ) : (
        application
      )}
    </StrictMode>,
  );
}

void startApplication();
