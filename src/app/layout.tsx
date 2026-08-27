import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppToaster } from "@/components/feedback/app-toaster";
import "./globals.css";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "ScolaPro",
    template: "%s · ScolaPro",
  },
  description: "A Namibia-first school operations and learning platform.",
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
