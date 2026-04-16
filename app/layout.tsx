import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Personal dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {/* Electron drag region — allows window to be dragged by the top strip */}
        <div className="titlebar-drag" />
        {children}
      </body>
    </html>
  );
}
