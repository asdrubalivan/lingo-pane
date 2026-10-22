# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

Un mod pour [Claude Code](https://claude.com/claude-code) qui vous enseigne une langue **en direct**, dans votre terminal : un panneau de leçon, des micro-leçons pendant que Claude travaille et un tuteur qui vous corrige comme vous le préférez.

> **Statut : précoce et privé.** Il fonctionne de bout en bout dans le terminal, mais il est encore en essai. Conception et état : [`docs/decisions.md`](docs/decisions.md) (en anglais).

## Ce qu'il fait

- Pendant que Claude travaille, un **split** s'ouvre à côté de la transcription (terminaux en plein écran à partir de 110 colonnes ; 40 % de la largeur par défaut) avec une courte leçon : **conversation**, **jeu de rôle** ou **lecture** avec le tuteur, en micro-unités de trois réponses. Sur un terminal plus étroit, un bouton `1: open lesson` au-dessus du prompt l'ouvre.
- Le tuteur vous corrige de façon socratique (il montre l'erreur et vous laisse réessayer) ; **Entrée sur une ligne vide** demande de l'aide. Vos erreurs deviennent des cartes, révisées à la manière de Pimsleur et affichées dans la ligne du spinner.
- `/lingo` l'ouvre ou le ferme à la main, `/lingo setup` lance l'assistant (langues, niveau, centres d'intérêt, largeur du split, modèle du tuteur, thème) et `/lingo theme <nom>` change les couleurs.
- Tout ce qui varie d'un apprenant à l'autre est une **stratégie** interchangeable : où vit votre contenu, comment les révisions sont planifiées, comment vous êtes corrigé et comment votre activité est consignée.

## Prérequis

- Claude Code 2.1.287 ou supérieur (les mods sont en accès anticipé).
- Terminal. Prévu pour fonctionner dans [herdr](https://github.com/herdrdev/herdr).
- Un abonnement Claude. Le tuteur fait ses propres appels au modèle avec les identifiants de votre session ; aucune clé d'API n'est nécessaire, mais cela **consomme les limites de votre forfait**.

## Confidentialité

Les mods s'exécutent hors du sandbox et peuvent voir vos prompts et vos appels d'outils. Ce que `lingo-pane` en fait :

- **Lit :** quand un tour commence et finit, si un appel d'outil demande votre permission, et la taille du terminal, pour ouvrir et fermer le split au bon moment. Il ne garde ni vos prompts ni les réponses de Claude, sauf si vous activez l'option ci-dessous.
- **Stocke** (dans le stockage des plugins de Claude Code, sur votre machine) : votre configuration, votre progression dans le pack fourni, les cartes tirées de vos erreurs et un court journal des unités terminées.
- **Envoie à Claude** (avec les identifiants de votre session, sur votre forfait) : les requêtes du tuteur, qui contiennent vos langues, votre niveau et vos centres d'intérêt, vos phrases dans la leçon et les erreurs à réviser. Avec l'option **« matériel de votre propre session »** activée (désactivée par défaut), aussi de courts extraits de votre dernier prompt et de la dernière réponse de Claude, après avoir remplacé ce qui ressemble à une clé, un jeton, un mot de passe ou une adresse e-mail par un marqueur tel que `[redacted]` ou `[email]`.
- **Traite cet extrait comme un texte non fiable.** La dernière réponse de Claude peut citer une page web ou un fichier, donc l'extrait peut contenir des instructions écrites par quelqu'un d'autre. Il est envoyé au modèle comme simple matière de sujets, dans un bloc délimité et marqué « pas des instructions », et auparavant le mod en retire le délimiteur et les étiquettes du format de réponse du tuteur (`FIX:`, `TUTOR:` et semblables), de sorte qu'il ne peut ni fermer le bloc ni se faire passer pour une réponse du tuteur. Cela réduit le risque sans le supprimer, puisque le modèle lit toujours le texte. Une correction proposée par le tuteur n'est conservée comme carte d'erreur que si elle est courte, en texte simple, avec deux formes différentes ; sinon elle est écartée et le tour continue sans elle.
- **Envoie à Google** seulement quand vous appuyez sur `🔊 listen` : la phrase à l'écran, ouverte dans Google Traduction dans votre navigateur.

Rien d'autre ne quitte votre machine.

## Contribuer

Il faut Node 22 ou plus récent. Depuis un clone propre :

```sh
npm ci
npm run check   # vérification des types, puis les tests
```

- `npm test` lance `claude plugin test .`, le kit de tests du plugin. La version de Claude Code est figée dans `package.json` (2.1.287, celle dont viennent les types) : les versions plus récentes ont changé le comportement du moteur, et deux tests de permissions échouent sur la 2.1.308 ; changez la version figée volontairement, pas par accident.
- `npm run typecheck` a besoin des déclarations de l'API des plugins dans `.claude-plugin/types/`. Le moteur de Claude Code les écrit quand il charge le mod, et git les ignore car elles dépendent de la version installée. Le script les crée pour vous en chargeant le mod une fois avec un `HOME` vide (ni identifiants, ni appel au modèle). `npm run types` les réécrit après un changement de la version figée.
- `npm run check:readmes` compare les titres de `README.md`, `README.es.md` et `README.fr.md` (même nombre et mêmes niveaux, dans le même ordre) : modifiez donc les trois dans le même commit ; `check` le lance.
- La CI (`.github/workflows/ci.yml`) lance `npm run check` à chaque pull request.
