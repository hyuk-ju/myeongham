import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { koKR } from "@clerk/localizations";
import "./globals.css";

export const metadata: Metadata = {
  title: "명함첩",
  description: "명함을 찍어두면 필요할 때 찾아주는 개인용 명함 관리",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 명함 이미지를 확대해 확인할 수 있어야 하므로 확대를 막지 않는다.
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#121110" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="min-h-full antialiased">
      <body className="flex min-h-dvh flex-col">
        <a
          href="#main-content"
          className="ui-action ui-action-primary fixed left-4 top-4 z-50 -translate-y-24 focus:translate-y-0"
        >
          본문으로 건너뛰기
        </a>
        <ClerkProvider localization={koKR}>{children}</ClerkProvider>
      </body>
    </html>
  );
}
