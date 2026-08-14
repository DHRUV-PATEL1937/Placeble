import type { Metadata } from "next";
import { PlacebleApp } from "../placeble-app";

export const metadata: Metadata = {
  title: "Activate account | Placeble",
  description: "Activate an institution-invited Placeble account.",
};

export default function ActivateAccountPage() {
  return <PlacebleApp />;
}
