import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppToaster } from "@/components/feedback/app-toaster";
import { PublicThemeMenu } from "@/components/theme/theme-preference";
import { SCOLAPRO_BRAND } from "@/lib/brand";
import "./globals.css";

const themeBootstrapScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("scolapro-theme");
    const theme = stored === "light" || stored === "dark" ? stored : "system";
    const root = document.documentElement;
    if (theme === "system") {
      delete root.dataset.theme;
      root.style.removeProperty("color-scheme");
    } else {
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    }
  } catch {
    // CSS prefers-color-scheme remains the fallback when storage is unavailable.
  }
})();
`;

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
    <html lang="en" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body className={plusJakartaSans.variable}>
        {children}
        <PublicThemeMenu />
        <AppToaster />
      </body>
    </html>
  );
}
