import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fraunces";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Outside — Find your way out there",
  description: "A campus discovery game for the paths between classes.",
  applicationName: "Outside",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Outside" },
};

export const viewport: Viewport = {
  themeColor: "#172b21",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}