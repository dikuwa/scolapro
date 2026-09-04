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
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={plusJakartaSans.variable}>
        {children}
        <AppToaster />
      </body>
    </html>
  );
}
