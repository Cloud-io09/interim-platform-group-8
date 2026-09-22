#!/usr/bin/env node
/**
 * Essai de fumée des notifications, de bout en bout.
 *
 *   npm run fumee:notifs
 *   npm run fumee:notifs -- https://mon-deploiement.vercel.app
 *
 * Éprouve les quatre types de notification dans l'application, les deux points
 * d'entrée que n8n interroge, **et le trajet réel jusqu'à Discord** : un salon privé
 * est créé pour de bon, le message y est posté, puis relu pour vérifier qu'il est
 * arrivé. Un flux n8n qui « s'allume vert » sans que rien n'atterrisse dans un salon
 * est le défaut que cet outil existe pour attraper.
 *
 * Le rattachement Discord passe normalement par OAuth, qu'un script ne peut pas
 * jouer : on écrit donc directement l'identifiant du salon en base, ce que seule
 * cette étape emprunte. Tout le reste passe par l'API publique.
 *
 * Nettoie derrière lui — comptes et salon — y compris en cas d'échec.
 */

import postgres from "postgres";

const base = (process.argv[2] ?? "http://127.0.0.1:3205").replace(/\/+$/, "");
const MARQUE = `notif-${Date.now()}`;
const MOT_DE_PASSE = "essai-notifications-interimatch-2026";
const SECRET = process.env.SECRET_N8N ?? "";
const API_DISCORD = "https://discord.com/api/v10";

let echecs = 0;
const comptes = [];
let salonCree = null;

function verifier(intitule, condition, detail = "") {
  if (!condition) echecs++;
  console.log(`${condition ? "  ok  " : "ÉCHEC "} ${intitule}${detail ? ` — ${detail}` : ""}`);
}
const titre = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function appel(chemin, methode = "GET", corps, cookie) {
  const r = await fetch(`${base}${chemin}`, {
    method: methode,
    headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
    ...(corps === undefined ? {} : { body: JSON.stringify(corps) }),
  });
  const t = await r.text();
  let json = null;
  try {
    json = t ? JSON.parse(t) : null;
  } catch {
    /* une page HTML : le statut suffit */
  }
  return { statut: r.status, corps: json, entetes: r.headers };
}

const appelN8n = (chemin, secret = SECRET) =>
  fetch(`${base}${chemin}`, { headers: { "x-secret-n8n": secret } }).then(async (r) => ({
    statut: r.status,
    corps: await r.json().catch(() => null),
  }));

async function inscrire(suffixe, role) {
  const email = `${MARQUE}-${suffixe}@exemple.test`;
  const r = await appel("/api/auth/inscription", "POST", { email, motDePasse: MOT_DE_PASSE, role });
  comptes.push(r.corps?.compte?.id);
  return { email, id: r.corps?.compte?.id, cookie: r.entetes.get("set-cookie")?.split(";")[0] ?? "" };
}

const dansNJours = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const sql = postgres(process.env.DATABASE_URL, { prepare: false });
const botConfigure = Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_SERVEUR_ID);
const enteteBot = {
  Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
  "Content-Type": "application/json",
};

console.log(`Essai de fumée des notifications — ${base}\n`);

try {
  // --- 1. Mise en place ------------------------------------------------------
  titre("1. Mise en place");
  const ent = await inscrire("entreprise", "entreprise");
  const inte = await inscrire("interimaire", "interimaire");
  verifier("deux comptes créés", Boolean(ent.id && inte.id), `${ent.id} / ${inte.id}`);

  // Un essai de fumée doit vérifier sa propre mise en place : la première version
  // ignorait ces deux réponses, et un SIRET refusé — il obéit à une clé de Luhn —
  // faisait échouer six vérifications plus loin, en désignant la mauvaise cause.
  const profilEnt = await appel("/api/profil/entreprise", "POST", {
    raisonSociale: `Essai Notifs ${MARQUE}`, siret: "44306184100005",
    adresse: "1 rue de la Paix", codePostal: "51100", ville: "Reims",
  }, ent.cookie);
  verifier("profil entreprise enregistré", profilEnt.statut === 200 || profilEnt.statut === 201,
    `statut ${profilEnt.statut}${profilEnt.corps?.message ? ` · ${profilEnt.corps.message}` : ""}`);

  const profilInt = await appel("/api/profil/interimaire", "POST", {
    prenom: "Essai", nom: "Notifications", telephone: "0600000000",
    adresse: "2 rue des Capucins", codePostal: "51100", ville: "Reims",
    rayonMobiliteKm: 50, metiers: ["F1702"], competences: [],
  }, inte.cookie);
  verifier("profil intérimaire enregistré", profilInt.statut === 200 || profilInt.statut === 201,
    `statut ${profilInt.statut}${profilInt.corps?.message ? ` · ${profilInt.corps.message}` : ""}`);

  // Une habilitation qui expire dans 30 jours : dans la fenêtre d'alerte par défaut.
  const echeance = dansNJours(30);
  const certif = await appel("/api/certifications", "POST", {
    typeCode: "CACES_R482", categorieCode: "B1", organismeEmetteur: "APAVE",
    numero: `ESSAI-${Date.now()}`, dateObtention: dansNJours(-365), dateEcheance: echeance,
  }, inte.cookie);
  verifier("habilitation déclarée, échéance dans 30 jours", certif.statut === 201, `statut ${certif.statut}`);

  await appel("/api/disponibilites", "POST", { dateDebut: dansNJours(1), dateFin: dansNJours(120) }, inte.cookie);

  // --- 2. mission_correspondante --------------------------------------------
  titre("2. Notification « mission correspondante »");
  const mission = await appel("/api/missions", "POST", {
    titre: `Maçon — essai ${MARQUE}`, metierCode: "F1702",
    description: "Essai de fumée des notifications.",
    adresse: "3 rue Gambetta", codePostal: "51100", ville: "Reims",
    dateDebut: dansNJours(5), dateFin: dansNJours(20),
    tauxHoraireMin: 14, tauxHoraireMax: 16,
    horaires: "7h30-12h / 13h-16h30, 35 h par semaine", qualification: "Maçon N3",
    certificationsRequises: [], competencesRequises: [],
    // `publier` et non `statut` : la création accepte un brouillon ou une
    // publication, et c'est la publication qui déclenche les notifications.
    publier: true,
  }, ent.cookie);
  verifier("mission publiée", mission.statut === 201,
    `statut ${mission.statut}${mission.corps?.message ? ` · ${mission.corps.message}` : ""}`);
  const missionId = mission.corps?.id;

  const fil = await appel("/api/notifications", "GET", undefined, inte.cookie);
  const types = (fil.corps?.notifications ?? []).map((n) => n.type);
  verifier("l'intérimaire est prévenu de la mission", types.includes("mission_correspondante"), types.join(", "));

  // --- 3. certification_expire ----------------------------------------------
  titre("3. Notification « habilitation qui expire »");
  // Produite en rattrapage à l'ouverture du fil : le second appel la contient.
  const fil2 = await appel("/api/notifications", "GET", undefined, inte.cookie);
  const types2 = (fil2.corps?.notifications ?? []).map((n) => n.type);
  verifier("l'échéance proche est signalée", types2.includes("certification_expire"), types2.join(", "));

  // --- 4. candidature, dans les deux sens ------------------------------------
  titre("4. Notifications de candidature");
  const post = await appel("/api/candidatures", "POST",
    { missionId, interimaireId: inte.id, vers: "candidatee" }, inte.cookie);
  verifier("l'intérimaire postule", post.statut === 200 || post.statut === 201,
    `statut ${post.statut}${post.corps?.message ? ` · ${post.corps.message}` : ""}`);

  const filEnt = await appel("/api/notifications", "GET", undefined, ent.cookie);
  const typesEnt = (filEnt.corps?.notifications ?? []).map((n) => n.type);
  verifier("l'entreprise est prévenue", typesEnt.length > 0, typesEnt.join(", "));

  const retenu = await appel("/api/candidatures", "POST",
    { missionId, interimaireId: inte.id, vers: "acceptee" }, ent.cookie);
  verifier("l'entreprise retient le profil", retenu.statut === 200,
    `statut ${retenu.statut}${retenu.corps?.message ? ` · ${retenu.corps.message}` : ""}`);

  const fil3 = await appel("/api/notifications", "GET", undefined, inte.cookie);
  const types3 = (fil3.corps?.notifications ?? []).map((n) => n.type);
  verifier("l'intérimaire est prévenu de l'affectation",
    types3.includes("candidature_proposee") || types3.includes("candidature_repondue"), types3.join(", "));

  // --- 5. Ce que n8n reçoit ---------------------------------------------------
  titre("5. Ce que les scénarios n8n reçoivent");
  const alertes = await appelN8n("/api/n8n/certifications-expirantes?jours=90");
  verifier("le flux d'échéance répond", alertes.statut === 200, `statut ${alertes.statut}`);
  const mienne = (alertes.corps?.alertes ?? []).find((a) => a.interimaireId === inte.id);
  verifier("notre intérimaire y figure", Boolean(mienne), mienne?.certification);
  verifier("le message est rédigé côté serveur", Boolean(mienne?.message?.length > 20));
  verifier("sans rattachement, le salon vaut null", mienne?.discordSalonId === null,
    String(mienne?.discordSalonId));

  // --- 6. Le trajet réel jusqu'à Discord -------------------------------------
  titre("6. Trajet réel jusqu'à Discord");
  if (!botConfigure) {
    console.log(" note  bot non configuré ici : le trajet Discord n'est pas éprouvé");
  } else {
    const creation = await fetch(`${API_DISCORD}/guilds/${process.env.DISCORD_SERVEUR_ID}/channels`, {
      method: "POST", headers: enteteBot,
      body: JSON.stringify({
        name: `essai-notifs-${Date.now()}`, type: 0,
        permission_overwrites: [
          { id: process.env.DISCORD_SERVEUR_ID, type: 0, deny: String(1 << 10) },
          { id: process.env.DISCORD_CLIENT_ID, type: 1, allow: String(1 << 10) },
        ],
      }),
    });
    verifier("un salon privé est créé", creation.ok, `statut ${creation.status}`);
    if (creation.ok) {
      salonCree = (await creation.json()).id;
      // L'identifiant Discord est celui du bot : il rend l'exception de permission
      // valide sans qu'un humain ait à autoriser quoi que ce soit, et il permet
      // d'éprouver la réparation d'un salon disparu.
      await sql`
        update compte
           set discord_salon_id = ${salonCree},
               discord_utilisateur_id = ${process.env.DISCORD_CLIENT_ID},
               discord_relie_le = now()
         where id = ${inte.id}`;

      const apres = await appelN8n("/api/n8n/certifications-expirantes?jours=90");
      const relie = (apres.corps?.alertes ?? []).find((a) => a.interimaireId === inte.id);
      verifier("l'API livre le salon du destinataire", relie?.discordSalonId === salonCree,
        String(relie?.discordSalonId));

      // Exactement ce que fait le nœud n8n.
      const envoi = await fetch(`${API_DISCORD}/channels/${relie.discordSalonId}/messages`, {
        method: "POST", headers: enteteBot, body: JSON.stringify({ content: relie.message }),
      });
      verifier("le message part dans le salon", envoi.ok, `statut ${envoi.status}`);

      const relus = await fetch(`${API_DISCORD}/channels/${salonCree}/messages?limit=5`, { headers: enteteBot });
      const messages = relus.ok ? await relus.json() : [];
      verifier("et il y est bien arrivé", messages.some((m) => m.content === relie.message),
        `${messages.length} message(s) relu(s)`);
    }
  }

  // --- 7. Cas limites ---------------------------------------------------------
  titre("7. Cas limites");
  verifier("sans secret, les flux sont refusés", (await appelN8n("/api/n8n/missions-a-notifier", "")).statut === 401);
  verifier("fenêtre d'échéance hors bornes refusée", (await appelN8n("/api/n8n/certifications-expirantes?jours=400")).statut === 400);
  verifier("fenêtre de missions hors bornes refusée", (await appelN8n("/api/n8n/missions-a-notifier?heures=800")).statut === 400);
  verifier("fenêtre non numérique refusée", (await appelN8n("/api/n8n/certifications-expirantes?jours=abc")).statut === 400);

  // Le troisième flux, le seul adressé à une entreprise.
  const relances = await appelN8n("/api/n8n/missions-non-pourvues?jours=1");
  verifier("le flux de relance répond", relances.statut === 200, `statut ${relances.statut}`);
  verifier("relance hors bornes refusée", (await appelN8n("/api/n8n/missions-non-pourvues?jours=200")).statut === 400);
  verifier("chaque relance porte un salon ou null",
    (relances.corps?.relances ?? []).every((r) => "discordSalonId" in r));
  verifier("et dit quoi faire, pas seulement que ça traîne",
    (relances.corps?.relances ?? []).every((r) => /profil|candidature|élargissez/i.test(r.message)),
    `${(relances.corps?.relances ?? []).length} relance(s)`);

  const missions = await appelN8n("/api/n8n/missions-a-notifier?heures=720");
  verifier("le flux de missions répond", missions.statut === 200, `statut ${missions.statut}`);
  verifier("chaque notification porte un salon ou null",
    (missions.corps?.notifications ?? []).every((n) => "discordSalonId" in n));

  // Salon supprimé à la main — par son titulaire, ou par un administrateur qui fait
  // le ménage. Sans réparation, l'identifiant mort restait en base et n8n postait
  // dans le vide à chaque exécution, sans que personne ne l'apprenne.
  if (salonCree) {
    await fetch(`${API_DISCORD}/channels/${salonCree}`, { method: "DELETE", headers: enteteBot });
    const perdu = await fetch(`${API_DISCORD}/channels/${salonCree}/messages`, {
      method: "POST", headers: enteteBot, body: JSON.stringify({ content: "après suppression" }),
    });
    verifier("un salon supprimé fait bien échouer l'envoi", perdu.status === 404, `statut ${perdu.status}`);

    const repare = await appel("/api/discord", "GET", undefined, inte.cookie);
    verifier("l'application recrée le salon disparu", repare.corps?.salonRecree === true,
      `salonRecree = ${repare.corps?.salonRecree}`);
    verifier("et le nouvel identifiant remplace l'ancien",
      Boolean(repare.corps?.salonId) && repare.corps.salonId !== salonCree,
      `${salonCree} → ${repare.corps?.salonId}`);

    salonCree = repare.corps?.salonId ?? null;

    const apresRepair = await appelN8n("/api/n8n/certifications-expirantes?jours=90");
    const relu = (apresRepair.corps?.alertes ?? []).find((a) => a.interimaireId === inte.id);
    verifier("les flux n8n repartent sur le nouveau salon", relu?.discordSalonId === salonCree,
      String(relu?.discordSalonId));

    // Une seconde consultation ne doit rien recréer : sans cette garantie, chaque
    // ouverture de l'écran empilerait un salon de plus.
    const secondPassage = await appel("/api/discord", "GET", undefined, inte.cookie);
    verifier("une seconde visite ne recrée rien", secondPassage.corps?.salonRecree === false,
      `salonRecree = ${secondPassage.corps?.salonRecree}`);
  }

  // Le fil reste lisible même quand le relais est muet : Discord n'est qu'un écho.
  const filFinal = await appel("/api/notifications", "GET", undefined, inte.cookie);
  verifier("les notifications restent dans l'application", (filFinal.corps?.notifications ?? []).length > 0,
    `${(filFinal.corps?.notifications ?? []).length} notification(s)`);
} finally {
  titre("Ménage");
  if (salonCree && botConfigure) {
    await fetch(`${API_DISCORD}/channels/${salonCree}`, { method: "DELETE", headers: enteteBot }).catch(() => {});
  }
  const vivants = comptes.filter(Boolean);
  if (vivants.length) {
    await sql`delete from compte where id = any(${vivants})`.catch(() => {});
    console.log(`  ok   ${vivants.length} compte(s) d'essai supprimé(s)`);
  }
  await sql.end();
}

console.log(echecs === 0 ? "\n\x1b[32mNotifications : tout est vert.\x1b[0m" : `\n${echecs} vérification(s) en échec.`);
process.exit(echecs === 0 ? 0 : 1);
