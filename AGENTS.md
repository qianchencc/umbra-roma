# UMBRA implementation notes

Keep the experience an art studio: the live architectural composition is the main content. Use the existing warm paper, ink, fine dividers and serif display system. Keep controls concise and useful.

Preserve real open arches, level camera verticals, strict light/shadow quantization and all three scene compositions. Do not replace the live scene with a static image. Static geometry belongs in lib/roman-geometry.ts; rendering and cleanup belong in components/RomanViewer.tsx; UI state belongs in app/page.tsx.

Before changes, estimate their scope. Verify material rendering or composition changes in the supported browser preview and run the TypeScript and production build checks where appropriate. PNG export must preserve the selected scene, palette, lighting and camera composition.
