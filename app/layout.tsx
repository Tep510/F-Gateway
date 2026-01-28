import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "./components/SessionProvider";
import ThemeProvider from "./components/ThemeProvider";

export const metadata: Metadata = {
  title: "F-Gateway | Friendslogi Data Exchange Portal",
  description: "クライアントとFriendslogiのデータ交換ポータル",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className="antialiased bg-white dark:bg-black text-black dark:text-white">
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
