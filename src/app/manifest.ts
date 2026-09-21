import type { MetadataRoute } from "next";
import { SCOLAPRO_BRAND } from "@/lib/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SCOLAPRO_BRAND.name,
    short_name: SCOLAPRO_BRAND.shortName,
    description: SCOLAPRO_BRAND.productDescription,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7fb",
    theme_color: "#303ecf",
    icons: [
      {
        src: "/brand/scolapro/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/brand/scolapro/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
