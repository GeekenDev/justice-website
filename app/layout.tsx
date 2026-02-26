import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getSiteUrl } from "@/lib/seo";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-heading",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Epstein Files Dashboard",
    template: "%s | Epstein Files",
  },
  description:
    "Search and inspect the latest Epstein files released by the DOJ (Department of Justice) and other sources.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "Epstein Files Explorer",
    title: "Epstein Files Explorer",
    description:
      "Search and inspect the latest Epstein files released by the DOJ (Department of Justice) and other sources.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Epstein Files Explorer",
    description:
      "Search and inspect the latest Epstein files released by the DOJ (Department of Justice) and other sources.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
