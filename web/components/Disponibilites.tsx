"use client";

import { useEffect, useId, useState } from "react";
import RetourFormulaire, { type Probleme } from "./RetourFormulaire";
import { envoyerJson } from "@/lib/client";

interface Periode {
  id: number;
  dateDebut: string;
  dateFin: string;
}

const enDateFr = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("fr-FR");

function nombreDeJours(debut: string, fin: string): number {
  const MS = 86_400_000;
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / MS) + 1;
}

export default function Disponibilites() {
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [problemes, setProblemes] = useState<Probleme[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [succes, setSucces] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const ids = { debut: useId(), fin: useId() };

  const problemeDe = (champ: string) => problemes.find((p) => p.champ === champ)?.message;

  async function recharger() {
    const r = await fetch("/api/disponibilites");
    if (r.ok) setPeriodes((await r.json()).disponibilites);
  }

  useEffect(() => {
    recharger().catch(() => setErreur("Impossible de charger vos disponibilités."));
  }, []);

  async function ajouter(evenement: React.FormEvent<HTMLFormElement>) {
    evenement.preventDefault();
    const formulaire = evenement.currentTarget;
    const d = Object.fromEntries(new FormData(formulaire));
    setEnCours(true);
    setProblemes([]);
    setErreur(null);
    setSucces(null);

    const { ok, corps } = await envoyerJson("/api/disponibilites", "POST", d);
    setEnCours(false);

    if (!ok) {
      setProblemes(corps.problemes ?? []);
      setErreur(corps.message ?? "Enregistrement impossible.");
      return;
    }
    formulaire.reset();
    setSucces("Période ajoutée.");
    await recharger();
  }

  async function supprimer(id: number, libelle: string) {
    if (!confirm(`Supprimer la période ${libelle} ?`)) return;
    await fetch(`/api/disponibilites/${id}`, { method: "DELETE" });
    await recharger();
  }

  return (
    <section aria-labelledby="titre-disponibilites">
      <h2 id="titre-disponibilites">Vos périodes déclarées</h2>
      <p className="secondaire">
        Déclarez les périodes où vous pouvez travailler. Elles ne vous excluent jamais
        d&apos;une mission : elles pèsent dans le classement, pour que les entreprises
        voient d&apos;abord ceux qui couvrent toute la durée du chantier.
      </p>

      {periodes.length > 0 && (
        <ul className="liste-nue liste-cartes" style={{ marginBottom: "2rem" }}>
          {periodes.map((p) => {
            const libelle = `du ${enDateFr(p.dateDebut)} au ${enDateFr(p.dateFin)}`;
            return (
              <li key={p.id} className="carte">
                <div className="ligne-certification">
                  <div>
                    <h3 style={{ fontSize: "1rem", marginBottom: "0.2rem" }}>
                      {libelle.charAt(0).toUpperCase() + libelle.slice(1)}
                    </h3>
                    <p className="petit secondaire" style={{ margin: 0 }}>
                      {nombreDeJours(p.dateDebut, p.dateFin)} jours
                    </p>
                  </div>
                  <button type="button" className="bouton bouton--secondaire" onClick={() => supprimer(p.id, libelle)}>
                    Supprimer
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={ajouter} className="carte" noValidate>
        <h3>Ajouter une période</h3>
        <div className="grille grille--2">
          <div className="champ">
            <label htmlFor={ids.debut}>À partir du</label>
            <input id={ids.debut} name="dateDebut" type="date" required />
            {problemeDe("dateDebut") && <p className="petit message-erreur">{problemeDe("dateDebut")}</p>}
          </div>
          <div className="champ">
            <label htmlFor={ids.fin}>Jusqu&apos;au</label>
            <input id={ids.fin} name="dateFin" type="date" required />
            {problemeDe("dateFin") && <p className="petit message-erreur">{problemeDe("dateFin")}</p>}
          </div>
        </div>

        <RetourFormulaire erreur={erreur} succes={succes} problemes={problemes} />

        <button className="bouton" type="submit" disabled={enCours}>
          {enCours ? "Enregistrement…" : "Ajouter cette période"}
        </button>
      </form>
    </section>
  );
}
