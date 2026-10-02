# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

Un mod de [Claude Code](https://claude.com/claude-code) que te enseña un idioma **en vivo**, dentro de tu terminal: un panel de lección, micro-lecciones mientras Claude trabaja y un tutor que te corrige como prefieras.

> **Estado: fase de diseño.** Todavía no hay código. Ver [`docs/decisions.md`](docs/decisions.md) (en inglés).

## Idea

- `/lingo` abre un panel de lección en vivo.
- Aparecen ejercicios cortos sobre el prompt mientras Claude trabaja en lo tuyo.
- Todo lo que varía entre estudiantes es una **strategy** intercambiable: dónde vive tu contenido, cómo se programan los repasos, cómo te corrigen y cómo se registra tu actividad.

## Requisitos

- Claude Code 2.1.287 o superior (los mods están en early access).
- Terminal. Se planea que funcione dentro de [herdr](https://github.com/herdrdev/herdr).
- Una suscripción de Claude. El tutor hace sus propias llamadas al modelo con las credenciales de tu sesión, así que no hace falta API key, pero **gasta los límites de tu plan**.

## Privacidad

Los mods corren fuera del sandbox y pueden ver tus prompts y tool calls. Esta sección listará exactamente qué lee, guarda y envía `lingo-pane` cuando exista el código.
