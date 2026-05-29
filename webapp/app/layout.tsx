import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { appConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: appConfig.title,
  description: appConfig.subtitle,
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
        {process.env.NODE_ENV === "production" && <SpeedInsights />}
      </body>
    </html>
  );
}
