import { afterAll, describe, expect, it } from "vitest";
import { connexion } from "@interimatch/core/db";
import { cle, redis } from "@interimatch/core";
import { BASE } from "./serveur";

const MARQUE = `n8n-${Date.now()}`;
const MOT_DE_PASSE = "chantier-de-reims-2026";
const SECRET = process.env.SECRET_N8N ?? "";
const emails: string[] = [];
/** Jetons ouverts par la suite, fermés à la fin : sinon ils vivent 7 jours. */
const cookiesOuverts: string[] = [];

/** Une mission dans un an : les échéances de test restent lisibles. */
const MISSION_DEBUT = "2027-06-01";
const MISSION_FIN = "2027-06-21";

async function appel(chemin: string, methode: string, corps?: unknown, cookie?: string) {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

async function appelN8n(chemin: string, secret = SECRET) {
  const r = await fetch(`${BASE}${chemin}`, { headers: { "x-secret-n8n": secret } });
  const t = await r.text();
  return { statut: r.status, corps: t ? JSON.parse(t) : null };
}

async function inscrire(suffixe: string, role: "entreprise" | "interimaire") {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  emails.push(email);
  const r = await fetch(`${BASE}/api/auth/inscription`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, motDePasse: MOT_DE_PASSE, role }),
  });
  return { email, cookie: r.headers.get("set-cookie")?.split(";")[0] ?? "" };
}

/** Date au format ISO, décalée de N jours par rapport à aujourd'hui. */
function dansNJours(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

afterAll(async () => {
  const sql = connexion();
  try {
    await sql`delete from compte where email like ${`${MARQUE}-%`}`;
  } finally {
    await sql.end();
  }
  const cache = redis();
  await Promise.all(emails.map((e) => cache.del(cle.tentativesEmail(e))));
});

describe("authentification des endpoints n8n", () => {
  it("refuse sans secret, avec un mauvais secret, ou avec un secret tronqué", async () => {
    for (const chemin of ["/api/n8n/certifications-expirantes", "/api/n8n/missions-a-notifier"]) {
      expect((await fetch(`${BASE}${chemin}`)).status, chemin).toBe(401);
      expect((await appelN8n(chemin, "pas-le-bon")).statut, chemin).toBe(401);
      // Un préfixe correct ne doit pas passer : la comparaison porte sur tout le secret.
      expect((await appelN8n(chemin, SECRET.slice(0, 8))).statut, chemin).toBe(401);
    }
  });

  it("accepte avec le bon secret", async () => {
    expect((await appelN8n("/api/n8n/certifications-expirantes")).statut).toBe(200);
    expect((await appelN8n("/api/n8n/missions-a-notifier")).statut).toBe(200);
  });

  it("refuse une fenêtre absurde", async () => {
    expect((await appelN8n("/api/n8n/certifications-expirantes?jours=0")).statut).toBe(400);
    expect((await appelN8n("/api/n8n/certifications-expirantes?jours=9999")).statut).toBe(400);
    expect((await appelN8n("/api/n8n/missions-a-notifier?heures=-1")).statut).toBe(400);
  });
});

describe("scénario 1 — alerte avant expiration", () => {
  it("remonte une certification qui expire bientôt, avec les missions qu'un renouvellement débloquerait", async () => {
    const ent = await inscrire("ent", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "Test n8n SAS", codePostal: "51100", ville: "Reims",
    }, ent.cookie);
    await appel("/api/missions", "POST", {
      titre: "Mission de contrôle n8n", metierCode: "F1302",
      codePostal: "51100", ville: "Reims",
      dateDebut: MISSION_DEBUT, dateFin: MISSION_FIN,
      certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
      publier: true,
    }, ent.cookie);

    const int = await inscrire("expirant", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Bientot", nom: "Perime", codePostal: "51100", ville: "Reims",
      rayonMobiliteKm: 50, metiers: ["F1302"],
    }, int.cookie);
    // **On retient l'identifiant du compte qu'on vient de créer.** Le test cherchait
    // son alerte par le nom « Bientot Perime », qui n'a rien d'unique : il tombait
    // sur le compte d'une exécution précédente dont le nettoyage avait échoué, et
    // vérifiait une échéance qui n'était pas la sienne. Quatre-vingt-neuf comptes
    // d'essai s'étaient accumulés en base sans que personne ne s'en aperçoive.
    const monId = (await appel("/api/moi", "GET", undefined, int.cookie)).corps.compte.id;
    // Expire dans 30 jours, donc bien avant la fin de mission : renouveler la débloque.
    await appel("/api/certifications", "POST", {
      typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
      numero: `N8N-${Date.now()}`, dateObtention: dansNJours(-3620), dateEcheance: dansNJours(30),
    }, int.cookie);

    const { corps } = await appelN8n("/api/n8n/certifications-expirantes?jours=60");
    const alerte = corps.alertes.find((a: { interimaireId: number }) => a.interimaireId === monId);
    expect(alerte).toBeDefined();
    expect(alerte.joursRestants).toBeGreaterThan(25);
    expect(alerte.joursRestants).toBeLessThanOrEqual(31);
    expect(alerte.missionsDebloquees).toBeGreaterThanOrEqual(1);
    // Le message doit porter le chiffre : c'est ce qui le rend actionnable.
    expect(alerte.message).toMatch(/rouvrirait/);
  });

  it("ne remonte pas une certification hors de la fenêtre demandée", async () => {
    const int = await inscrire("lointain", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Encore", nom: "Valide", codePostal: "51100", ville: "Reims",
      rayonMobiliteKm: 50, metiers: ["F1302"],
    }, int.cookie);
    await appel("/api/certifications", "POST", {
      typeCode: "AIPR", organismeEmetteur: "OPPBTP",
      numero: `AIPR-${Date.now()}`, dateObtention: dansNJours(-30), dateEcheance: dansNJours(1800),
    }, int.cookie);

    const { corps } = await appelN8n("/api/n8n/certifications-expirantes?jours=60");
    expect(corps.alertes.some((a: any) => a.nomComplet === "Encore Valide")).toBe(false);
  });
});

describe("scénario 2 — notification de mission correspondante", () => {
  it("notifie un profil conforme et jamais un profil écarté", async () => {
    const ent = await inscrire("ent2", "entreprise");
    await appel("/api/profil/entreprise", "POST", {
      raisonSociale: "Test n8n II SAS", codePostal: "51100", ville: "Reims",
    }, ent.cookie);

    const conforme = await inscrire("conforme", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Notifiable", nom: "Conforme", codePostal: "51100", ville: "Reims",
      rayonMobiliteKm: 50, metiers: ["F1302"],
    }, conforme.cookie);
    await appel("/api/certifications", "POST", {
      typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "AFPA",
      numero: `OK-${Date.now()}`, dateObtention: dansNJours(-100), dateEcheance: "2035-01-01",
    }, conforme.cookie);

    const ecarte = await inscrire("ecarte", "interimaire");
    await appel("/api/profil/interimaire", "POST", {
      prenom: "Jamais", nom: "Notifie", codePostal: "51100", ville: "Reims",
      rayonMobiliteKm: 50, metiers: ["F1302"],
    }, ecarte.cookie);

    const creee = await appel("/api/missions", "POST", {
      titre: "Mission notifiable", metierCode: "F1302",
      codePostal: "51100", ville: "Reims",
      dateDebut: MISSION_DEBUT, dateFin: MISSION_FIN,
      tauxHoraireMin: 14, tauxHoraireMax: 16,
      certificationsRequises: [{ typeCode: "CACES_R482", categorieCode: "B1" }],
      publier: true,
    }, ent.cookie);

    const { corps } = await appelN8n("/api/n8n/missions-a-notifier?heures=1");
    // Restreint à NOTRE mission : d'autres fichiers de test publient des missions
    // sans exigence, où tout le monde est légitimement conforme.
    const pourCetteMission = corps.notifications.filter((n: any) => n.missionId === creee.corps.id);
    const noms = pourCetteMission.map((n: any) => n.nomComplet);
    expect(noms).toContain("Notifiable Conforme");
    // Un profil non conforme ne doit jamais recevoir de notification : ce serait
    // l'inviter sur un chantier où il ne peut pas aller.
    expect(noms).not.toContain("Jamais Notifie");

    const notif = pourCetteMission.find((n: any) => n.nomComplet === "Notifiable Conforme");
    expect(notif.message).toContain("Mission notifiable");
    expect(notif.message).toContain("€/h");
    expect(notif.score).toBeGreaterThan(0);
  });

  it("n'examine pas les missions publiées hors de la fenêtre", async () => {
    const { corps } = await appelN8n("/api/n8n/missions-a-notifier?heures=1");
    const { corps: large } = await appelN8n("/api/n8n/missions-a-notifier?heures=720");
    expect(large.missionsExaminees).toBeGreaterThanOrEqual(corps.missionsExaminees);
  });
});
