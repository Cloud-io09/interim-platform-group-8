"use client";

import { useEffect, useRef } from "react";

export interface Probleme {
  champ: string;
  message: string;
}

interface Props {
  erreur: string | null;
  succes: string | null;
  problemes?: Probleme[];
}

/**
 * Retour d'un envoi de formulaire, placé juste au-dessus du bouton d'envoi.
 *
 * L'emplacement n'est pas cosmétique : sur un formulaire long, un message affiché en
 * haut est hors écran au moment où l'utilisateur clique en bas. Il croit alors que
 * rien ne s'est passé — l'échec devient silencieux alors que le serveur a répondu.
 *
 * Le focus est déplacé sur le message à son apparition, ce qui le porte à la fois à
 * l'écran et à la connaissance d'un lecteur d'écran (RGAA 7.4).
 */
export default function RetourFormulaire({ erreur, succes, problemes = [] }: Props) {
  const zone = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (erreur || succes) zone.current?.focus();
  }, [erreur, succes]);

  if (!erreur && !succes) return null;

  return (
    <div
      ref={zone}
      tabIndex={-1}
      role={erreur ? "alert" : "status"}
      className={erreur ? "encart-erreur" : "encart-succes"}
    >
      <p style={{ margin: 0, fontWeight: 500 }}>{erreur ?? succes}</p>
      {erreur && problemes.length > 0 && (
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
          {problemes.map((p, i) => (
            <li key={`${p.champ}-${i}`}>{p.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
