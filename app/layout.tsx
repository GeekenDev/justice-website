import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Mono, Arimo } from "next/font/google";
import { absoluteUrl, getSiteUrl, primarySitelinkPages } from "@/lib/seo";
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

const arimo = Arimo({
  subsets: ["latin"],
  variable: "--font-arimo",
});

const siteUrl = getSiteUrl();
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${siteUrl}/#website`,
      url: siteUrl,
      name: "Epstein Files Explorer",
      potentialAction: {
        "@type": "SearchAction",
        target: `${absoluteUrl("/search")}?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    ...primarySitelinkPages.map((page) => ({
      "@type": "SiteNavigationElement",
      name: page.name,
      url: absoluteUrl(page.path),
    })),
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Epstein Files Search",
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
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body
        className={`${spaceGrotesk.variable} ${ibmPlexMono.variable} ${arimo.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
