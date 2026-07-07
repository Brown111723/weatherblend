---
name: weatherblend-design
description: Use this skill to generate well-branded interfaces and assets for WeatherBlend, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the README.md file within this skill, and explore the other available files.
If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create static HTML files for the user to view. If working on production code, you can copy assets and read the rules here to become an expert in designing with this brand.
If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production code, depending on the need.

Key facts about WeatherBlend:
- A dark, mobile-first multi-model weather app. Its identity is the "quatrefoil" palette — four hues that always mean the same metric: mint=temp (#7EE8A5), blue=rain (#5FA4FF), lime=wind (#A8E63E), purple=cloud (#C8A6FF). Accent blue #4d8df0 carries interaction.
- Canvas is near-black navy (#0c0f15). System UI sans for chrome; system monospace for data tables. No webfonts.
- Iconography is bespoke inline SVG (no icon library); weather glyphs are composed procedurally by weather code; emoji only as decorative punctuation.
- The signature mark is the data-orb — four circles sized by live values.

Start from `styles.css` (tokens) and the components in `components/`. The full visual rationale is in README.md; the original app source is in `_source/`.
