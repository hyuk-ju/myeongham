import type { ReactNode } from "react";
import { beforeMount } from "@playwright/experimental-ct-react/hooks";
import "@/app/globals.css";

beforeMount(async ({ App }) => (
  <TestBoundary>
    <App />
  </TestBoundary>
));

function TestBoundary({ children }: Readonly<{ children: ReactNode }>) {
  return <div data-testid="ct-production-styles">{children}</div>;
}
