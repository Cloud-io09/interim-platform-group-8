import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocumentMission from "@/components/DocumentMission";
import { exigerSession } from "@/lib/garde";

export const metadata: Metadata = {
  title: "Mon document de mission",
  robots: { index: false, follow: false },
};

/**
 * Le même document, vu par la personne employée.
 *
 * Les mentions obligatoires du Code du travail existent pour elle : les lui refuser
 * revenait à tenir un registre plutôt qu'à remettre un document. La garde porte sur
 * l'affectation — un identifiant deviné ne rend rien.
 */
export default async function MonDocumentMission({ params }: { params: Promise<{ id: string }> }) {
  const session = await exigerSession("interimaire");
  const { id } = await params;
  const missionId = Number(id);
  if (!Number.isInteger(missionId)) notFound();

  return <DocumentMission missionId={missionId} compteId={session.compteId} role="interimaire" />;
}
