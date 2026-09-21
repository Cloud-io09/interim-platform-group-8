"use client";

import { useEffect, useRef, useState } from "react";
import { envoyerJson } from "@/lib/client";

/**
 * Consommation du lien de confirmation d'adresse.
 *
 * La confirmation part **au chargement**, sans demander de clic. L'utilisateur a déjà
 * agi : il a ouvert un lien reçu dans sa boîte, ce qui est précisément la preuve
 * attendue. Lui redemander « confirmez-vous ? » ajouterait une étape qui ne prouve
 * rien de plus — et c'est sans risque ici, le jeton ne réalise que ce que son
 * destinataire a lui-même demandé.
 *
 * Le garde-fou de React en développement monte deux fois : sans la sentinelle, le
 * second montage consommerait un jeton déjà détruit et afficherait un échec sur un
 * parcours réussi.
 */
export default function ConfirmationAdresse({ jeton }: { jeton: string }) {
  const [etat, setEtat] = useState<"encours" | "ok" | "echec">("encours");
  const [message, setMessage] = useState("");
  const [changement, setChangement] = useState(false);
  const lance = useRef(false);

  useEffect(() => {
    if (lance.current) return;
    lance.current = true;

    envoyerJson<{ confirme: string; email: string; message: string }>(
      "/api/auth/verification",
      "POST",
      { jeton }
    ).then(({ ok, corps }) => {
      setEtat(ok ? "ok" : "echec");
      setChangement(corps.confirme === "changement");
      setMessage(corps.message ?? "Confirmation impossible.");
    });
  }, [jeton]);

  if (etat === "encours") {
    return (
      <p className="secondaire" role="status">
        Confirmation en cours…
      </p>
    );
  }

  return (
    <div className={etat === "ok" ? "carte carte--verdict-ok" : "carte carte--verdict-bloque"}>
      <h2 className="titre-carte">
        {etat === "ok" ? "Adresse confirmée" : "Ce lien n'a pas pu être utilisé"}
      </h2>
      <p className="petit" role="status">
        {message}
      </p>
      {etat === "ok" ? (
        <a className="bouton" href={changement ? "/connexion" : "/espace"}>
          {changement ? "Me reconnecter" : "Revenir à mon espace"}
        </a>
      ) : (
        <a className="bouton bouton--secondaire" href="/espace">
          Revenir à mon espace
        </a>
      )}
    </div>
  );
}
