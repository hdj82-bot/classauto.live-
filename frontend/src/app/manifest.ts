import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IFL Platform",
    short_name: "IFL",
    description: "Interactive Flipped Learning Platform",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F9FAFB",
    theme_color: "#4F46E5",
    icons: [
      {
        src: "/icons/icon-192x192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/icon-512x512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
