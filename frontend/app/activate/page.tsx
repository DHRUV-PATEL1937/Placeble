import type { Metadata } from "next";
import { PlacebleApp } from "@/src/features/auth/components/placeble-app";

export const metadata: Metadata = {
  title: "Activate account | Placeble",
  description: "Activate an institution-invited Placeble account.",
};

export default function ActivateAccountPage() {
  return <PlacebleApp />;
}
