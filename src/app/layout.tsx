import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppToaster } from "@/components/feedback/app-toaster";
import { SCOLAPRO_BRAND } from "@/lib/brand";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: SCOLAPRO_BRAND.name,
    template: `%s · ${SCOLAPRO_BRAND.name}`,
  },
  applicationName: SCOLAPRO_BRAND.name,
  description: SCOLAPRO_BRAND.productDescription,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: SCOLAPRO_BRAND.shortName,
  },
  icons: {
    icon: [
      { url: "/brand/scolapro/icon-blue.svg", type: "image/svg+xml" },
      { url: "/brand/scolapro/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/brand/scolapro/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/brand/scolapro/icon-blue.svg",
    apple: [{ url: "/brand/scolapro/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body className={plusJakartaSans.variable}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
