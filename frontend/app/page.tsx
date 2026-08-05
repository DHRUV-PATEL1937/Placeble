import type { Metadata } from "next";
import { PlacebleApp } from "./placeble-app";

export const metadata: Metadata = {
  title: "Dashboard | Placeble",
  description: "Your complete career readiness workspace.",
};

export default function Home() {
  return <PlacebleApp />;
}
