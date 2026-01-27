import type { Metadata } from "next";
import "./globals.css";
import SessionProvider from "./components/SessionProvider";

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
    <html lang="ja">
      <body className="antialiased">
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
