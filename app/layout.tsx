import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoScope — Pull Request Intelligence",
  description:
    "Evidence-backed pull request impact analysis for JavaScript and TypeScript repositories.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
