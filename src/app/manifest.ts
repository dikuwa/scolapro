import type { MetadataRoute } from "next";
import { SCOLAPRO_BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SCOLAPRO_BRAND.name,
    short_name: SCOLAPRO_BRAND.shortName,
    description: SCOLAPRO_BRAND.productDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#06112e",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
