import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { appConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.title,
  description: appConfig.subtitle,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the top bar, tab bar and sheets extend under notches / home indicators;
  // the CSS pads them back with env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#f4f1e8",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV === "production" && (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        )}
      </body>
    </html>
  );
}
