import { ApiReference } from "@scalar/nextjs-api-reference";

const config = {
  theme: "kepler",
  url: "/openapi.json",
  metaData: {
    title: "Epstein Files API",
    description: "Access the Epstein Files programatically",
    ogDescription: "Access the Epstein Files programatically",
    ogTitle: "Epstein Files API",
    // ogImage: "https://example.com/image.png",
    // twitterCard: "summary_large_image",
    // Add more...
  },
  telemetry: false,
} as const;

export const GET = ApiReference(config);
