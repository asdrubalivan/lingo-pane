# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

Un mod pour [Claude Code](https://claude.com/claude-code) qui vous enseigne une langue **en direct**, dans votre terminal : un panneau de leçon, des micro-leçons pendant que Claude travaille et un tuteur qui vous corrige comme vous le préférez.

> **Statut : phase de conception.** Il n'y a pas encore de code. Voir [`docs/decisions.md`](docs/decisions.md) (en anglais).

## Idée

- `/lingo` ouvre un panneau de leçon en direct.
- De courts exercices apparaissent au-dessus du prompt pendant que Claude s'occupe de votre travail habituel.
- Tout ce qui varie d'un apprenant à l'autre est une **stratégie** interchangeable : où vit votre contenu, comment les révisions sont planifiées, comment vous êtes corrigé et comment votre activité est consignée.

## Prérequis

- Claude Code 2.1.287 ou supérieur (les mods sont en accès anticipé).
- Terminal. Prévu pour fonctionner dans [herdr](https://github.com/herdrdev/herdr).
- Un abonnement Claude. Le tuteur fait ses propres appels au modèle avec les identifiants de votre session ; aucune clé d'API n'est nécessaire, mais cela **consomme les limites de votre forfait**.

## Confidentialité

Les mods s'exécutent hors du sandbox et peuvent voir vos prompts et vos appels d'outils. Cette section indiquera précisément ce que `lingo-pane` lit, stocke et envoie une fois le code écrit.
