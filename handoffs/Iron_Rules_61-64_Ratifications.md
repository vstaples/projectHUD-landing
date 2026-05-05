# Iron Rule 61 — Ratification

**Status:** ratified 2026-05-05 evening (later)
**Authority:** operator + architect
**Scope:** every HTML page that loads JavaScript or CSS files
via `<script src>` or `<link href>` cache-busting query strings

---

## Rule

**Cache-bust query strings on `<script src>` and `<link href>`
attributes derive from the global `_PROJECTHUD_VERSION` value,
not from per-module hardcoded version literals.** When the
global version pin bumps, every script and stylesheet's
cache-bust query string updates automatically. Per-module
internal version pins are forbidden as cache-bust sources.

---

## Why this rule exists

CMD-AEGIS-1.1 surfaced the canonical case. After bumping
`js/version.js` to `v20260504-CMD-AEGIS-1.1`, the operator
reported that `_mwFirmId.toString().includes('aaaaaaaa')`
returned true — meaning the browser was still running the
unpatched version of `mw-events.js` despite the global
version pin bump. Investigation revealed the script tag's
cache-bust query string (`?v=20260423-CMD78g2`) was hardcoded
to a module-internal version, NOT the global pin.

When the global pin bumped, the browser's cache key for that
file didn't change because the URL didn't change. Browsers
served stale cached copies of files whose internal version
hadn't moved.

The fix at the time was operator-driven re-deploy. The rule's
purpose is structural prevention: every script tag's
cache-bust query string should derive from the same value
that the global pin bump moves. One source of truth for
"this is a fresh deploy."

---

## §1 — What the rule requires

For every script or stylesheet loaded by an HTML page:

```html
<!-- Before: brittle to global pin bumps -->
<script src="/js/cmd-center.js?v=20260423-CMD78g2"></script>

<!-- After: cache-bust derives from global pin -->
<script src="/js/cmd-center.js?v=__PROJECTHUD_VERSION__"></script>
```

Where `__PROJECTHUD_VERSION__` is either:
- A build-time substitution (preferred for production
  deployments)
- A runtime DOM-rewrite at page load that replaces the
  placeholder with `window._PROJECTHUD_VERSION` before script
  tag evaluation (acceptable for current build pattern)

For HTML pages that already have a script-loading mechanism
(e.g., a loader function in `js/loader.js` or similar), the
loader uses `window._PROJECTHUD_VERSION` directly when
constructing each `<script>` element's `src` attribute.

For statically-authored HTML pages (no loader), the cache-bust
attribute is left as a placeholder that the deploy pipeline
substitutes.

---

## §2 — When the rule does NOT fire

- External scripts loaded from CDNs (Google Fonts,
  cdnjs.cloudflare.com, etc.) where the project does not
  control the cache-bust mechanism — these use whatever
  cache-bust the external source provides.
- Scripts loaded by Edge Functions or other server-side
  contexts where cache-bust isn't a concern.
- One-time bootstrap scripts that load before
  `_PROJECTHUD_VERSION` is defined (e.g., `version.js` itself
  cannot cache-bust against a value it defines).

---

## §3 — Cross-module application

Applies to every HTML page in ProjectHUD: `accord.html`,
`cadence.html`, `compass.html`, and any future module's
top-level HTML.

The agent migrating an existing page to this rule pattern
verifies in deploy that the cache-bust mechanism resolves
correctly under live conditions — page loads, script tags
emit with current version pin in their query strings, browser
fetches fresh copies after a global pin bump.

---

*Iron Rule 61 ratified 2026-05-05 evening (later).*

# Iron Rule 62 — Ratification

**Status:** ratified 2026-05-05 evening (later)
**Authority:** operator + architect
**Scope:** every Supabase Storage upload of non-PDF artifacts
intended for user/auditor consumption

---

## Rule

**Supabase Storage's `contentType` upload parameter is metadata,
not a serving directive. For correct browser display of
non-PDF artifacts (HTML, plain text, images, JSON, etc.),
either (a) use the `download: filename` flag on `createSignedUrl`
to force attachment Content-Disposition, OR (b) use a public
bucket where extension-based MIME inference applies.** Private
buckets serve all objects with `text/plain` Content-Type
regardless of upload `contentType` setting.

---

## Why this rule exists

CMD-A7 surfaced the canonical case. The render-minutes Edge
Function uploaded HTML output with `contentType: 'text/html;
charset=utf-8'`. Browsers fetching the signed URL displayed
the file as plain text source rather than rendering it as a
page. Investigation revealed Supabase Storage's signed-URL
serving path returns `text/plain` for all private-bucket
objects regardless of the `contentType` set at upload time.

The architect's instinct was that `contentType` would be
preserved through the request lifecycle. It is not. The
Supabase Storage REST API treats `contentType` as object
metadata (queryable via the storage admin API) but does not
emit it as the Content-Type response header on signed-URL
GETs from private buckets.

The fix in CMD-A7 was the `download: filename` flag on
`createSignedUrl()`, which forces an attachment
Content-Disposition. This bypasses the Content-Type display
problem at the cost of losing inline display — files become
downloads, not viewable in-browser.

A future architectural improvement may be to use a public
bucket with extension-based MIME inference, or to insert a
small Edge Function in the serving path that emits correct
Content-Type headers. CMD-A7's approach (force download) is
the v0.1 acceptable workaround.

---

## §1 — What the rule requires

When uploading non-PDF artifacts to Supabase Storage for
consumption via signed URL:

1. **Set `contentType` correctly at upload** — for metadata
   fidelity and future-proofing if Supabase changes the
   serving behavior.
2. **At signed-URL creation, use `download: filename`** to
   force attachment Content-Disposition:
   ```javascript
   const { data, error } = await supabase
     .storage
     .from('bucket-name')
     .createSignedUrl(path, expirySeconds, {
       download: 'meaningful-filename.html'
     });
   ```
3. **Document the workaround** in the calling code's comments
   so future maintainers don't waste investigation time
   re-discovering the constraint.

For PDF artifacts specifically, no special handling is
required — browsers recognize PDF magic bytes and render
inline regardless of declared Content-Type. PDFs work
correctly without the `download` flag.

---

## §2 — When the rule does NOT fire

- Public buckets (`avatars` and similar) — extension-based
  MIME inference applies; HTML, JSON, etc. serve correctly
  without `download` flag.
- Buckets accessed via custom Edge Function pass-through that
  controls Content-Type emission directly.
- Server-side or backend-only consumption where the file is
  read via `supabase.storage.from(...).download(...)` and
  processed programmatically — Content-Type doesn't apply.

---

## §3 — Cross-module application

Applies to every coding agent generating user-consumable
artifacts via Supabase Storage across all ProjectHUD modules.
Future modules generating exports, reports, archives, or any
non-PDF user-facing artifacts inherit this discipline.

If a future architectural decision adopts public buckets or
edge-served content for these use cases, the rule's spirit
remains (Content-Type-aware serving) but the mechanism shifts.
This rule documents the v0.1 reality.

---

*Iron Rule 62 ratified 2026-05-05 evening (later).*

# Iron Rule 63 — Ratification

**Status:** ratified 2026-05-05 evening (later)
**Authority:** operator + architect
**Scope:** every Supabase Edge Function that imports
third-party libraries

---

## Rule

**Edge Functions running in Supabase Edge runtime cannot use
libraries requiring `Deno.lstatSync`, `Deno.readFileSync`, or
other blocklisted filesystem syscalls. Survey the runtime's
syscall blocklist before importing third-party modules; prefer
pure-JavaScript libraries over native-binary wrappers
(puppeteer-deno, playwright-deno, sharp, native image-
processing wrappers, etc.).**

---

## Why this rule exists

CMD-A7 surfaced the canonical case. The render-minutes Edge
Function imported `puppeteer-deno` for headless-browser PDF
generation. At runtime, the function failed with: "Deno.lstatSync
is blocklisted on the current context." Supabase Edge runtime
is a sandboxed Deno deploy environment that blocks filesystem
syscalls puppeteer requires for Chromium binary access.

This is a runtime constraint, not a configuration miss.
Puppeteer-Deno requires filesystem access for binary launch;
Supabase Edge does not provide that access. The two are
fundamentally incompatible.

The CMD-A7 fix was an HTML fallback — degrading the render to
HTML output when puppeteer fails. This shipped as v0.1 with
documented PASS-weak determinism.

The rule's purpose is structural prevention: identify the
blocklist constraint before importing libraries that violate
it, rather than discovering at runtime.

---

## §1 — What the rule requires

When an Edge Function brief specifies a third-party library
dependency:

1. **Architect surveys the library's runtime requirements** —
   does it require filesystem access? Native binaries?
   Process spawning? Network access beyond the function's
   declared egress?
2. **Architect verifies against Supabase Edge runtime
   blocklist** — currently includes `Deno.lstatSync`,
   filesystem write outside `/tmp`, child process spawning,
   and other syscalls. Authoritative reference is Supabase's
   documentation; agent confirms against deployed reality.
3. **If the library requires blocklisted syscalls, the brief
   surfaces the incompatibility before commissioning.** The
   architect either:
   - Specifies a pure-JS alternative (pdf-lib, jsPDF, etc.)
   - Reframes the CMD to a different runtime (regular
     Supabase function, hosted service, browser-side)
   - Accepts a graceful fallback as v0.1 commitment with
     documented limitation
4. **At CMD-execution time, agent verifies the library's
   actual behavior** in the Edge runtime via a smoke probe
   before building substantial code on top of it. First-caller
   hazards (Iron Rule 60) apply.

---

## §2 — Pure-JS preference for common operations

For common operations, prefer pure-JS libraries over wrappers:

| Operation | Avoid | Prefer |
|---|---|---|
| PDF generation | puppeteer, playwright | pdf-lib, jsPDF |
| Image processing | sharp, native bindings | imagescript (Deno-native) |
| Cryptography | native crypto wrappers | Web Crypto API (built-in) |
| HTML parsing | jsdom (filesystem-coupled) | deno-dom |

Pure-JS libraries trade some performance and feature richness
for runtime compatibility. The compatibility benefit dominates
for serverless/sandboxed contexts.

---

## §3 — When the rule does NOT fire

- Edge Functions running in non-sandboxed runtimes (regular
  Supabase functions, self-hosted, dedicated containers)
  where filesystem access is available.
- Application-side code (browser, mobile) where the runtime
  has different constraints.
- Server-side rendering done outside the Edge runtime entirely.

---

## §4 — Cross-module application

Applies to every Edge Function across ProjectHUD's Supabase
deployment. Future Edge Functions inherit the discipline; the
blocklist constraint is universal across the project's Edge
runtime.

If the project adopts hosted Cloudflare Workers, Vercel Edge,
or another serverless runtime, this rule's specifics may shift
but the discipline (verify-runtime-compatibility-before-import)
holds.

---

*Iron Rule 63 ratified 2026-05-05 evening (later).*

# Iron Rule 64 — Ratification

**Status:** ratified 2026-05-05 evening (later)
**Authority:** operator + architect
**Scope:** every brief that introduces a new mechanism for a
category of work the codebase has done before

---

## Rule

**Before specifying mechanisms for a category of work (font
loading, document rendering, identity resolution, channel
naming, error handling, file storage, event emission, etc.),
the architect surveys established codebase patterns for that
category. The brief either (a) follows the established
pattern with documented rationale, or (b) explicitly justifies
divergence as a first-caller-hazard call. Briefs that
introduce new mechanisms without surveying prior art are
doctrinally incomplete.**

---

## Why this rule exists

Two consecutive CMDs in the post-build polish phase surfaced
the canonical pattern.

**CMD-A7's storage-bucket creation:** the architect drafted
the brief assuming Accord would be the project's first
storage bucket consumer. SQL inspection revealed five existing
buckets created via direct INSERT into `storage.buckets`
through filesystem migrations. The agent followed the
established pattern; the architect's "first-caller" framing
was wrong.

**CMD-A7-POLISH-1's font loading:** the architect drafted §4
with three font-loading strategy options based on assumed Edge
Function constraints. The agent's survey revealed:
- `cadence.html`, `accord.html`, and `compass.html` all use
  Google Fonts CDN `<link>` for editorial typography
- The "Edge Function may not reach Google Fonts" constraint
  the brief cited was a misread (font loading happens at
  view time in the auditor's browser, not at function-render
  time)
- The codebase already had the better fonts (Fraunces, IBM
  Plex Sans, IBM Plex Mono) via established convention
- The brief's Lora/Poppins specification was based on the
  architect's last-session sandbox availability, not on
  production codebase reality

In both cases, the architect treated Accord as a first-caller
when established prior art existed in the same codebase. The
agent's survey caught the failure; the brief's spec was
revised; the work proceeded correctly.

The rule formalizes the discipline: **the codebase is its own
authoritative reference for "how we do things." A brief that
specifies a different mechanism for an established category
without justifying the divergence is doctrinally
underspecified.**

---

## §1 — What the rule requires at brief-draft time

For each mechanism the brief specifies that touches an
established category of work:

1. **The architect identifies what category the mechanism
   belongs to** — font loading, document rendering, identity
   resolution, error reporting, etc.
2. **The architect surveys prior art in the codebase** for
   that category. Grep, SQL inspection, file inspection — by
   any practical means.
3. **If prior art exists**, the brief either:
   - Specifies the established pattern, OR
   - Specifies a deviation with explicit justification
     (first-caller-hazard reasoning, technical constraint,
     etc.)
4. **If no prior art exists**, the brief notes this
   explicitly so the agent knows they're operating on novel
   ground (Iron Rule 60 first-caller hazards apply).

The survey effort is small. Most categories of work yield
clear answers via 5-10 minutes of inspection. The cost of
specifying a divergent mechanism is much larger when the
agent then has to follow up with a "you should be using the
established pattern" finding mid-execution.

---

## §2 — What the rule requires at CMD-execution time

When the agent receives a brief that specifies a mechanism
for a category of work:

1. **If the brief documents prior-art survey**, the agent
   follows the brief's specification.
2. **If the brief specifies a mechanism without documenting
   the prior-art survey**, the agent surveys before building.
   If the survey reveals an established pattern the brief's
   spec diverges from, the agent halts and surfaces — does
   NOT silently follow the brief's spec when the codebase
   suggests a different answer.
3. **If the survey reveals no prior art**, the agent
   proceeds with the brief's spec under first-caller-hazard
   awareness (Iron Rule 60).

---

## §3 — Categories that commonly trigger the rule

Non-exhaustive. Each is a category where the codebase tends
to develop conventions over time:

- **Font loading** — CDN `<link>` vs. base64 inline vs.
  system fallback
- **Storage bucket creation** — SQL migration vs. dashboard
  vs. admin API
- **Document rendering** — server-side library vs. client-side
  print vs. browser-rendered
- **Identity resolution** — `_myResource` vs. `CURRENT_USER`
  vs. `auth.uid()`
- **Channel naming** — firm-scoped vs. resource-scoped vs.
  user-scoped
- **Error handling** — throw vs. return-error vs.
  silent-with-finding
- **Cache busting** — global pin vs. per-module pin vs.
  filename-hash
- **Event emission** — direct API.post vs. CoC.write vs.
  cmd-center broadcast

For any category in this list, brief authors apply the rule.
Categories not in this list may also apply; the list is
illustrative.

---

## §4 — Cross-module application

Applies to every architect-drafted brief and every coding
agent across all ProjectHUD modules. The codebase-as-spec
discipline is module-agnostic.

The rule pairs with Iron Rule 52 §4 (logical-concern
collisions): Rule 52 §4 covers detecting parallel
implementations of the same concern; Rule 64 covers
preventing parallel implementations from being introduced in
the first place via brief-spec discipline.

---

## §5 — Architect-side accountability

Two recent briefs (CMD-A7 and CMD-A7-POLISH-1) violated this
rule's spirit; the agent's surveys recovered the work. The
architect's brief-drafting practice must internalize: **the
codebase is the spec; the brief is advisory.** When in doubt,
the established pattern wins.

This is a stronger statement than Rule 55 (architect-side
canonical-source verification). Rule 55 covers verifying
substrate-behavior assertions; Rule 64 covers surveying
codebase conventions before specifying new mechanisms. Both
require architect-side discipline at brief-draft time.

---

*Iron Rule 64 ratified 2026-05-05 evening (later).*
