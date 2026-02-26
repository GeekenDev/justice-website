import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "My DOJ Search Upvotes",
  description:
    "View the DOJ search results you have upvoted, including direct links and preview access.",
  alternates: {
    canonical: "/doj-my-upvotes",
  },
  openGraph: {
    title: "My DOJ Search Upvotes",
    description:
      "Your upvoted DOJ search results in the Epstein Files browser.",
    type: "website",
    url: "/doj-my-upvotes",
  },
};

export default function DOJMyUpvotesLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
