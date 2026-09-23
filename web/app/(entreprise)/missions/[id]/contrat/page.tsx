import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocumentMission from "@/components/DocumentMission";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Document de mission",
  robots: { index: false, follow: false },
};

export default async function ContratMission({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("entreprise");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  return <DocumentMission missionId={missionId} compteId={session.compteId} role="entreprise" />;
}
