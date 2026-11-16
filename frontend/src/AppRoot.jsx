import { StrictMode } from "react";
import App from "./App.jsx";
import { ClerkProvider } from "@clerk/react";
import { BrowserRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in frontend/.env");
}

const queryClient = new QueryClient();

function AppRoot() {
  return (
    <StrictMode>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <ClerkProvider publishableKey={publishableKey}>
            <App />
          </ClerkProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </StrictMode>
  );
}

export default AppRoot;
