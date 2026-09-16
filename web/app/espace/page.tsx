import { redirect } from "next/navigation";
import { exigerSession } from "@/lib/garde";

/** Aiguillage : chaque rôle a son espace, il n'y a pas de page commune. */
export default async function Espace() {
  const session = await exigerSession();
  redirect(session.role === "entreprise" ? "/espace/entreprise" : "/espace/interimaire");
}
