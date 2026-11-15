# Public website and SEO integration

This extends the existing Express/EJS monolith. The private application, SQLite database, account system and publication moderation remain in place. No deployment, domain configuration, new database, data reset or migration was performed.

## Repository inventory at implementation

- **Reusable:** localized SL/EN/DE routes and i18next resources; landing page and brand; invitation-only signup/login; workspace roles and author checks; private recipe/ingredient/step/image tables; independent public snapshots; per-language moderation/completeness; canonical global categories; precise serving scaling; favorites/copying; profile publishing; weekly planner; separate moderator/Super Admin roles.
- **Modified:** public landing now includes real database features and directory CTAs; approved community reads are publicly routed through a restricted projection; shared layouts distinguish website/app chrome; login can return to a public recipe; existing private pages gain noindex metadata and a public-website link.
- **Added:** public directory/detail templates, canonical recipe slugs, anonymous approved-image delivery, public information/legal pages, metadata/JSON-LD generation, sitemap and robots endpoints.

The audited checkout was clean at commit `30db4cc`. Existing tests/fixtures and migrations were inspected; tests were subsequently deferred by the user's explicit instruction. The earlier multilingual test results are not verification of this change.

## Local use

Start the app using the existing `npm run dev` or `npm start` command. The usual server address is `http://127.0.0.1:3000`.

| URL | Behavior |
| --- | --- |
| `/` | Redirect to preferred language; visitors see the landing page and signed-in users keep their dashboard |
| `/sl/welcome`, `/en/welcome`, `/de/welcome` | Public website for visitors and signed-in users |
| `/sl/community`, `/en/community`, `/de/community` | Approved public directory in the URL's language |
| `/sl/community/1` | Existing numeric URL; if approved in Slovenian, redirects to its canonical slug |
| `/sl/community/1-title-from-approved-snapshot` | Recipe detail; use the actual link from the directory |
| `/sl/community/1/images/0?size=small` | Thumbnail only if that publication has a complete approved Slovenian version |
| `/{language}/about`, `/contact`, `/privacy`, `/legal` | Localized information and configurable legal/contact data |
| `/{language}/register` | Invitation-only registration explanation, not open signup |
| `/sitemap.xml` | Public indexable pages and approved language-specific recipe URLs |
| `/robots.txt` | Public crawl rules and sitemap location |

Existing `/{language}/recipes` URLs remain the authenticated workspace collection. To avoid breaking those bookmarks, the public directory keeps the existing `/community` route family. `/sl/recepti` and `/de/rezepte` are aliases redirecting to the corresponding public directory. Existing `/si/` language aliases continue to normalize to `/sl/`.

Signed-in users can open **Javna spletna stran / Public website / Öffentliche Webseite** from the workspace toolbar, then return with **Moja kuhinja / My kitchen / Meine Küche**. The private dashboard has not been redesigned.

## Public data and language rules

`publicCookbook()` reads the existing `recipe_publications` and `publication_translations` tables. It requires the requested language, approved status and complete flag. It does not create copies or new public records. Search, category filters, sorting, pagination and counts apply that restriction before returning rows. An unavailable language returns a localized 404 rather than source-language fallback. Hreflang and sitemap recipe entries also include only complete approved versions.

Public templates receive a limited projection: approved title/description, quantities, unit labels, steps, times/servings when present, translated global categories, approved attribution/source references and generated image endpoint URLs. They do not receive private source recipes, household information, membership details, user emails, private notes/comments, internal moderation feedback, raw snapshots or image filenames.

Authenticated favorites, quick hearts and community copying reuse existing POST routes and CSRF/authorization checks. Guests see a login action for saving; login can safely return them to the public recipe, where they explicitly choose to save. There is no automatic copy or public registration. Draft/rejected/pending submissions and cross-language review previews still require the originating workspace or moderator permission and retain the private interface/noindex handling.

Anonymous public reading does not create a session just to count visitors. Existing authenticated daily readership counting remains in use; anonymous readers are not added to that counter. No analytics SDK, tracking cookie, external font or third-party runtime service was added.

## Images

Images are selected from an approved language snapshot, with numeric endpoint validation and generated WebP filename checks. The upload directory is never mounted publicly. Each request re-checks approval and language; filesystem failures return a generic unavailable response without a local path. Private `/images/:id` endpoints remain authenticated. Lists use lazy thumbnails/responsive candidates; the detail cover uses the larger approved image. Public images use `no-store` so withdrawn approval is checked again rather than relying on a stale application cache.

## Canonicals, slugs and structured data

Recipe slugs combine the existing publication ID and a normalized approved title. The ID guarantees uniqueness; immutable approved snapshots make their slugs stable. An old numeric or noncanonical slug URL redirects to the current canonical path only when its requested language is public. No migration or private-source title lookup is needed.

Public HTML includes title/description, canonical URL, HTML language, reciprocal hreflang for available versions, Open Graph and social image metadata. Filtered/favorite/search pages use `noindex, follow`; paginated directory pages have their own canonical page parameter. Private/authenticated-only pages retain authentication and receive `X-Robots-Tag` plus noindex metadata. Robots rules are crawl hints, never access control.

Recipe JSON-LD uses only actual approved fields: title, description, images, author attribution, ingredient quantities/units, HowToStep instructions, ISO 8601 durations and serving yield. Missing times/yield/images are omitted rather than invented. Original decimal quantities are preserved in JSON-LD. There are no fabricated ratings, reviews, nutrition values or promotional statistics. JSON serialization escapes HTML-significant characters before insertion into the inert JSON-LD script element; other content uses escaped EJS output.

The sitemap is XML escaped, includes actual recorded modification dates where available and never includes private recipes, account/admin/planner routes or unapproved translations. Root `/robots.txt` and `/sitemap.xml` do not require login or a language redirect. Absolute URLs use configuration, never a visitor-provided Host header.

Implementation references: [Google's recipe structured-data documentation](https://developers.google.com/search/docs/appearance/structured-data/recipe) and [localized-version/hreflang documentation](https://developers.google.com/search/docs/specialty/international/localized-versions). No external search-engine submission or rich-results validation was performed.

## Configuration and manual follow-up

Optional variables are documented in `.env.example`:

```dotenv
SITE_URL=
LEGAL_NAME=
LEGAL_ADDRESS=
CONTACT_EMAIL=
```

For local use, an empty `SITE_URL` produces `http://127.0.0.1:PORT`. A future production installation must set its real HTTP/HTTPS origin (without a path, query, credentials or fragment) so canonicals, social images and sitemap URLs use that origin. This implementation does not set a domain or configure hosting.

Legal/contact values are shown as escaped text. Empty values show localized placeholders; no operator name, address or legal identity is invented. Complete those details and review the factual privacy/legal copy before making a publicly reachable installation. Registration remains invitation-only: changing that product policy requires a separate decision and implementation.

Public recipes without approved EN/DE versions correctly remain absent in those directories. Add and review translations through the existing profile/publication workflow. Missing photos remain placeholders; missing legal data and invitation-only signup are explicit states. No blog CMS, newsletter, ads, payments, shopping list, AI translation/import or Google Analytics was implemented.

## Changed files

- `src/services/public-cookbook.js`: read-only public projection, language-filtered queries, stable slug paths, image authorization and indexable entries.
- `src/services/seo.js`: metadata, absolute URLs, JSON-LD serialization and XML sitemap output.
- `src/controllers/public-site.js`, `src/routes/public-site.js`: explicit public read endpoints, aliases, website pages and crawler endpoints before the private router.
- `src/app.js`, `src/i18n/urls.js`, `src/middleware/security.js`: public route integration, crawler URL handling, noindex defaults and sessionless anonymous public reads.
- `src/config/index.js`, `.env.example`: optional canonical origin and legal/contact fields.
- `src/controllers/auth.js`, `src/controllers/community.js`, `src/routes/index.js`: safe login return, public favorite return URLs and removal of superseded public GET registrations; private write/review guards remain.
- `src/views/layouts/header.ejs`, `footer.ejs`, `src/views/landing.ejs`, `src/views/components/workspace-toolbar.ejs`: existing layout/landing reuse and website/app navigation.
- `src/views/public/*`, new `public-header`, `public-footer`, `public-card`, `seo` partials: public presentation and search/recipe information.
- `src/locales/{sl,en,de}/public.json`: feature-specific translated interface, metadata and informational text.
- `src/styles.css`, `public/css/app.css`: scoped website styles and compiled production CSS; profile heading wrapping also prevents German text overflowing narrow screens.

## Verification status

Initially implemented without automated checks as requested. The user subsequently authorized verification, completed on 15 November 2026:

- `npm test`: 72 passed, zero failures or skipped tests.
- `npm run build`: production CSS compiled successfully.
- `npm run test:browser`: desktop/mobile application flows passed, including profile publication and combined-list deduplication.
- `npm run test:browser:i18n`: language preferences, localized routes, translation editing, per-language publication approval and EN/DE layouts at 1440/390/320px passed.

Integration and browser expectations now use localized URLs and the current public/private navigation. A genuine German profile heading overflow at 320px was fixed. `tests/public-site.test.js` verifies anonymous approved-language visibility, pending-language denial, canonical redirects independent of the Host header, safe Recipe JSON-LD, exclusion of private snapshot fields, sitemap withdrawal and authenticated access boundaries. All fixture databases and uploads are temporary; real user data was not migrated or reset. These checks do not constitute a full SEO, accessibility or cross-browser audit. Future checks still require an explicit user request under `AGENTS.md`.
