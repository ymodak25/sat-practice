# Northstar SAT

Northstar SAT is a local, adaptive Digital SAT practice app. It converts the learning loop in the original sketch into a usable flow:

`official topic map → original practice set → answer feedback → mastery signals → targeted next set`

## Run it

This project has no external runtime dependencies.

```bash
npm run dev
```

Then visit [http://localhost:4173](http://localhost:4173).

## What’s included

- A public College Board-aligned syllabus with **8 domains and 30 granular skills**: 11 Reading & Writing skills and 19 Math skills.
- One original, offline seed question for every skill, so practice works before an API key is configured.
- A practice loop supporting multiple choice and grid-in responses, answer explanations, strategies, a scratchpad, and session summaries.
- Browser-local progress tracking, including per-skill mastery, domain evidence, recent session history, a weakness-prioritized recommendation, and mixed review.
- An optional **OpenAI API key** in Settings for fresh question generation and misconception feedback.
- A dependency-free local Node server that acts as a small API proxy. The key is held only in browser session storage and is sent only to the local server for the requested API call; it is not written to disk or progress storage.

## AI setup

1. Run the app locally.
2. Open **Settings**.
3. Paste an OpenAI API key, choose a model available to your project, and optionally test the connection.
4. Save settings, then start a new practice set.

The server uses the Responses API with Structured Outputs so generated questions and feedback arrive in a predictable shape. It verifies each generated multiple-choice item before displaying it; if AI is unavailable, the app keeps the original local set ready instead.

For a deployed app, replace the user-supplied-key local proxy with normal server-side secret management and user authentication. Do not expose a platform-owned API key in frontend code.

## Content approach

The app uses the public SAT topic taxonomy, not a scraped question bank. Its local and AI-generated questions are original, SAT-aligned practice material. College Board practice tests, Bluebook content, and Question Bank items are proprietary and should not be copied into the app.

Canonical topic sources:

- [College Board — SAT content domains](https://satsuite.collegeboard.org/practice/content-domains)
- [College Board — Reading & Writing specifications](https://satsuite.collegeboard.org/k12-educators/about/alignment/reading)
- [College Board — Math specifications](https://satsuite.collegeboard.org/k12-educators/about/alignment/math)

## Project layout

- `public/data.js` — official-domain metadata and 30 original starter questions.
- `public/app.js` — UI, local persistence, adaptive selection, and optional AI calls.
- `public/styles.css` — responsive visual design.
- `server.js` — static local server plus OpenAI generation, feedback, and connection-test endpoints.
