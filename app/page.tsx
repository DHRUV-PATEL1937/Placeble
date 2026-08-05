import type { Metadata } from "next";
import { PlacebleDashboard } from "./placeble-dashboard";

export const metadata: Metadata = {
  title: "Dashboard | Placeble",
  description: "Your complete career readiness workspace.",
};

export default function Home() {
  return <PlacebleDashboard />;
}
