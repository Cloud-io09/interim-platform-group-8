import { succes } from "@/lib/reponses";
import { retirerSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Déconnexion. La session est supprimée de Redis en plus du cookie : un jeton
 * recopié ailleurs devient inutilisable immédiatement, ce qu'un JWT ne permet pas.
 */
export async function POST() {
  await retirerSession();
  return succes({ message: "Déconnecté." });
}
