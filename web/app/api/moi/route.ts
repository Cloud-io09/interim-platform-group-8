import { erreur, succes } from "@/lib/reponses";
import { sessionCourante } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Session courante — sert au front à savoir qui est connecté. */
export async function GET() {
  const session = await sessionCourante();
  if (!session) return erreur("Non authentifié.", 401);
  return succes({
    compte: { id: session.compteId, email: session.email, role: session.role },
  });
}
