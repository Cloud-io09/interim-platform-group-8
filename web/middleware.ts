import { NextResponse, type NextRequest } from "next/server";
import { NOM_COOKIE } from "@/lib/cookie";

/**
 * Aiguillage de la page d'accueil.
 *
 * Un visiteur anonyme voit la page de présentation ; un utilisateur connecté n'a
 * rien à y faire et doit arriver sur son espace.
 *
 * Fait en middleware plutôt que dans la page : lire la session dans le composant
 * rendrait `/` dynamique et lui ferait perdre son prérendu, donc son intérêt pour le
 * référencement — alors que la page publique est la seule surface SEO du produit.
 *
 * On se contente ici de constater la PRÉSENCE du cookie, sans le valider : le
 * middleware ne doit pas interroger Redis à chaque visite. Un cookie périmé mène à
 * `/espace`, qui vérifie réellement la session et renvoie vers la connexion.
 */
export function middleware(requete: NextRequest) {
  const connecte = requete.cookies.has(NOM_COOKIE);
  if (connecte) {
    return NextResponse.redirect(new URL("/espace", requete.url));
  }
  return NextResponse.next();
}

export const config = {
  // Uniquement la racine : tout le reste garde son propre contrôle d'accès.
  matcher: "/",
};
