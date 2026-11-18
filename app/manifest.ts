import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dukaan Saathi",
    short_name: "Dukaan",
    description: "Stock assistant for kiranas",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#090b0f",
    theme_color: "#090b0f",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
