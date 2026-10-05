# lingo-pane

[English](README.md) · [Español](README.es.md) · [Français](README.fr.md)

Un mod de [Claude Code](https://claude.com/claude-code) que te enseña un idioma **en vivo**, dentro de tu terminal: un panel de lección, micro-lecciones mientras Claude trabaja y un tutor que te corrige como prefieras.

> **Estado: temprano y privado.** Funciona de punta a punta en la terminal, pero todavía se está probando. Diseño y lo construido: [`docs/decisions.md`](docs/decisions.md) (en inglés).

## Qué hace

- Mientras Claude trabaja, se abre un **split** junto a la transcripción (terminales en pantalla completa desde 110 columnas; 40 % del ancho por defecto) con una lección corta: **conversación**, **role-play** o **lectura** con el tutor, en microunidades de tres respuestas. En terminales más angostas, un botón `1: open lesson` sobre el prompt lo abre.
- El tutor te corrige de forma socrática (señala el error y te deja intentarlo de nuevo); **Enter en una línea vacía** pide ayuda. Tus errores se vuelven tarjetas, que se repasan al estilo Pimsleur y aparecen en la línea del spinner.
- `/lingo` lo abre o lo cierra a mano, `/lingo setup` abre el asistente (idiomas, nivel, intereses, ancho del split, modelo del tutor, tema) y `/lingo theme <nombre>` cambia los colores.
- Todo lo que varía entre estudiantes es una **strategy** intercambiable: dónde vive tu contenido, cómo se programan los repasos, cómo te corrigen y cómo se registra tu actividad.

## Requisitos

- Claude Code 2.1.287 o superior (los mods están en early access).
- Terminal. Se planea que funcione dentro de [herdr](https://github.com/herdrdev/herdr).
- Una suscripción de Claude. El tutor hace sus propias llamadas al modelo con las credenciales de tu sesión, así que no hace falta API key, pero **gasta los límites de tu plan**.

## Privacidad

Los mods corren fuera del sandbox y pueden ver tus prompts y tool calls. Lo que `lingo-pane` hace con eso:

- **Lee:** cuándo empieza y termina un turno, si una tool call necesita tu permiso y el tamaño de la terminal, para abrir y cerrar el split a tiempo. No guarda tus prompts ni las respuestas de Claude, salvo que actives la opción de abajo.
- **Guarda** (en el almacén de plugins de Claude Code, en tu máquina): tu setup, tu avance en el pack incluido, las tarjetas hechas con tus errores y un registro corto de las unidades terminadas.
- **Envía a Claude** (con las credenciales de tu sesión, a cargo de tu plan): las peticiones del tutor, que llevan tus idiomas, nivel e intereses, tus líneas en la lección y los errores que tocan repasar. Con la opción **"material de tu propia sesión"** activada (apagada por defecto), también extractos cortos de tu último prompt y de la última respuesta de Claude, quitando antes lo que parezca una clave, una contraseña o un correo.
- **Envía a Google** solo cuando pulsas `🔊 listen`: la frase en pantalla, abierta en Google Translate en tu navegador.

Nada más sale de tu máquina.
