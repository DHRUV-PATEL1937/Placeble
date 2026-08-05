import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/sora/600.css";
import "@fontsource/sora/700.css";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "Placeble — Career readiness, made clear";
  const description = "Build your profile, practise with AI coaches, and turn steady preparation into placement readiness.";
  return {
    metadataBase: new URL(origin),
    title: { default: title, template: "%s | Placeble" },
    description,
    applicationName: "Placeble",
    keywords: ["career readiness", "placement preparation", "student careers"],
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "Placeble career readiness dashboard" }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
