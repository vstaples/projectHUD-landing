# Iron Rule 47 — Ratification

**Status:** ratified 2026-05-04
**Authority:** operator + architect (see §0.1 of Style Doctrine)
**Scope:** every migration, brief, or schema-touching task that
references existing tables, columns, or constraints

---

## Rule

**Before declaring a foreign key, primary key reference, or any
explicit dependency on an existing schema element, the agent
verifies the target's actual structure via direct introspection.**
Schema inventory documents are working references, not
authoritative oracles. Production reality is the only source of
truth at write time.

The verification mechanism is `information_schema.columns`,
`information_schema.table_constraints`, the `\d` psql command, or
the `schema_fk_audit()` helper installed in production by
CMD-A1.5.

---

## Why this rule exists

CMD-A1 attempted to write FK references to `users(user_id)` and
`projects(project_id)` based on inventory v2 cluster
descriptions. Production reality: `users(id)` and `projects(id)`.
The FK declarations failed; three round-trips of patches were
required to converge. The error was preventable in seconds with a
schema-existence probe.

CMD-A1.5's audit confirmed the pattern across 14 tables in the
Accord blast radius. The rule generalizes: schema inventories
drift, FK targets are commonly assumed rather than verified, and
the cost of verification (one `information_schema` query) is
dramatically lower than the cost of recovery from a wrong
assumption (rerun migration, debug constraint failures, patch and
redeploy).

This rule does NOT forbid relying on inventory documents as a
starting point for thinking about schema. It forbids treating
those documents as final authority. The agent reads the
inventory, then verifies.

---

## §1 — What counts as verification

A verification check answers: *does this column exist with the
type and target I'm assuming?* Acceptable mechanisms:

- `information_schema.columns` query for column existence and type
- `information_schema.table_constraints` + `key_column_usage` for
  PK / FK structure
- `\d <table_name>` in psql session
- `SELECT * FROM schema_fk_audit('<table_name>')` (helper
  installed by CMD-A1.5)
- Direct query against `pg_catalog.pg_class` /
  `pg_catalog.pg_attribute` for advanced cases

What does NOT count as verification:

- Reading `projecthud-file-inventory-v2.md`
- Reading `aegis-shared-loaders-inventory-v1.md`
- Reading any prior brief's claims about a schema element
- Reading code comments that describe schema
- Trusting a CMD hand-off's claims without re-checking
- "I remember from a prior session"

Inventory documents are *guides to where to look*; they are not
the look itself.

---

## §2 — When verification applies

This rule fires whenever any of these are true:

1. The agent is about to declare a `REFERENCES <table>(<col>)`
   clause in a migration.
2. The agent is about to write `JOIN <table> ON <col>` in a
   query the agent did not author.
3. The agent is about to write `INSERT INTO <table> (...)` for a
   table the agent did not create in this CMD.
4. The agent is about to assume a NOT NULL constraint on a
   column when constructing a fixture or test row.
5. The agent is about to assume a column's name based on a
   convention (e.g., `*_id` suffix for PKs).
6. **The agent is about to write application-code references to
   schema columns** — JS object property reads against API
   responses (`row.id` vs `row.thread_id`), ORM attribute
   declarations, GraphQL resolvers, or any code that names
   schema columns explicitly.

For tables created within the same CMD as the reference, the
agent's own `CREATE TABLE` is the authority — no separate
verification needed.

**Cross-layer scope.** The rule is layer-agnostic. The same
verification discipline applies whether the agent is writing SQL
DDL, SQL DML, application code, ORM mappings, GraphQL schemas,
or test fixtures. A column reference that fails at runtime
because the column doesn't exist as assumed is the same failure
mode whether it surfaces in `pg_catalog`, in PostgREST's response
parser, or in a JS property read.

**Amendment history.** §2 item 6 and the "Cross-layer scope"
paragraph added 2026-05-04 evening after CMD-A3 self-violated
the rule by referencing `accord_*` rows by `.id` in JavaScript
when the actual PKs are `<table>_id`. Original Rule 47 (CMD-A1
/ CMD-A1.5 era) scoped only to SQL FK declarations; the
amendment broadens to all layers.

---

## §3 — Failure mode caught

Conventional naming patterns are dangerous because they are
*usually* right. `users.user_id` is the assumption a careful
reader would default to. Production reality is `users.id` (no
`_id` suffix on the PK column when the table name is itself
suffixed by domain). The rule's value is precisely that it
forces verification *especially* when the assumption feels safe.

CMD-A1's three-patch path was: assume → fail → patch → fail →
patch → fail → patch → succeed. With the rule, that path is:
verify → write correctly → succeed.

---

## §4 — Cross-module application

The rule applies to every ProjectHUD module's coding agents
operating against the shared Supabase backend. It applies
whether the agent is migrating, querying, inserting, or
constructing test fixtures.

Agents working against module-private state (filesystems,
in-memory data structures, module-internal types) inherit no
obligation from this rule.

---

*Iron Rule 47 ratified 2026-05-04.*

# Iron Rule 48 — Ratification

**Status:** ratified 2026-05-04
**Authority:** operator + architect
**Scope:** every Postgres function, trigger, or migration that
calls a function provided by an extension

---

## Rule

**When a Postgres function, trigger, or migration calls a
function provided by an extension (pgcrypto, pgjwt, pg_net,
pgsodium, etc.), the agent verifies the extension's installed
schema and either qualifies all calls explicitly or sets
`search_path` on the calling function to include that schema.**

Bare unqualified calls to extension functions resolve only when
the extension is installed in `public` or when `search_path`
happens to include the extension's actual schema. Both conditions
are environment-dependent and brittle.

---

## Why this rule exists

CMD-A1's seal trigger called `digest()` (pgcrypto) without
qualification. In production, pgcrypto is installed in the
`extensions` schema, not `public`. The bare call failed at
trigger fire time with `function digest(text, text) does not
exist`. Patch 1 corrected the calls to `extensions.digest(...)`;
the trigger then succeeded.

The pattern is general. Supabase installs many extensions in the
`extensions` schema by default, including pgcrypto, pg_net,
pg_graphql, pg_stat_statements, and others. Application code
that resolves these via the implicit `search_path = "$user",
public` will fail. The fix is trivial; the discovery cost is not.

Extension function calls also frequently appear inside
`SECURITY DEFINER` functions, where the executing role's
`search_path` may differ from the user role's. Failing to set
`search_path` explicitly on a `SECURITY DEFINER` function is a
known security antipattern (search-path-based privilege
escalation), so this rule pairs with security best practice
naturally.

---

## §1 — What the rule requires

Two acceptable forms:

**Form A — Schema-qualified calls.**

```sql
CREATE OR REPLACE FUNCTION my_func()
RETURNS text
LANGUAGE sql
AS $$
  SELECT encode(extensions.digest('input', 'sha256'), 'hex');
$$;
```

**Form B — Explicit `search_path` on the function.**

```sql
CREATE OR REPLACE FUNCTION my_func()
RETURNS text
LANGUAGE sql
SET search_path = public, extensions
AS $$
  SELECT encode(digest('input', 'sha256'), 'hex');
$$;
```

For `SECURITY DEFINER` functions, Form B is strongly preferred —
it documents the security-relevant `search_path` choice at the
function definition. For `SECURITY INVOKER` functions, either
form is acceptable.

---

## §2 — Verification before declaration

Before writing any extension-function call, the agent verifies:

```sql
SELECT extname, extnamespace::regnamespace AS schema
FROM pg_extension
WHERE extname = 'pgcrypto';  -- or whichever extension
```

Returns the extension's actual installed schema. The agent uses
that schema in the qualification or `search_path` declaration.

For commonly-used extensions in this project (verified
2026-05-04):

| Extension | Installed schema |
|---|---|
| `pgcrypto` | `extensions` |
| `uuid-ossp` | `extensions` (functions like `uuid_generate_v4()` may need qualification too) |

This list is illustrative, not exhaustive. Verify per call.

---

## §3 — What the rule does NOT require

- Re-verification when an existing function in the codebase
  already has correct qualification — agents trust prior CMDs'
  work that has shipped and been verified.
- Verification for functions the SQL standard guarantees in
  every Postgres install (e.g., `now()`, `coalesce()`,
  `length()`).
- Verification for functions defined in the same migration
  (those resolve via the migration's own scope).

---

## §4 — Cross-module application

The rule applies to every coding agent that writes Postgres
functions, triggers, or migrations against the shared Supabase
backend, across all ProjectHUD modules. It applies whether the
agent is creating new functions or modifying existing ones.

If an existing function in the codebase violates this rule, the
agent surfaces the violation as a finding but does NOT
opportunistically fix it — that's a separate brief's scope.

---

*Iron Rule 48 ratified 2026-05-04.*

# Iron Rule 49 — Ratification

**Status:** ratified 2026-05-04
**Authority:** operator + architect
**Scope:** every migration that introduces a column with a
non-obvious foreign key target

---

## Rule

**When a column foreign-keys to a target table whose relationship
is non-obvious from the column name, the migration includes a
`COMMENT ON COLUMN` annotation that spells out the target.** The
annotation is read by future agents inspecting the schema and
prevents the same misreading from recurring.

A "non-obvious" FK target is any case where:

- The column name does not include the target table's name
  (e.g., `actor_resource_id` → `resources(id)` is obvious;
  `decided_by` → ??? is not)
- The column name suggests a different target than the actual
  one (e.g., a `*_user_id` column that actually FKs to
  `resources(id)`)
- Multiple columns on the same table FK to different targets
  with similar semantic roles (the legacy meetings family's
  `recorded_by` → users vs `prepared_by` → resources is the
  archetype)

For obvious FK targets (column name explicitly contains the
target table's name and resolves to the conventional PK), no
annotation is required.

---

## Why this rule exists

CMD-A1's seal trigger initially wrote `coc_events.actor_resource_id`
with the meeting's `organizer_id` value. The column name
`actor_resource_id` should have signaled the FK target, but
CMD-A1's mental model was anchored to "user attribution" because
that's how Accord's substrate was designed. The translation
failed at runtime.

Inventory v2 documented the FK target only at cluster level
("Chain of Custody + audit"), not at column level. The semantic
documentation existed in `coc.js`'s header comment. None of these
were durably attached to the schema element itself.

`COMMENT ON COLUMN` attaches the documentation to the column
where every future reader (agent or human) sees it during schema
inspection — `\d+`, `pg_dump`, Supabase Studio's column inspector,
and the `information_schema.columns.column_comment` field all
surface it.

CMD-A1.5's audit found the legacy meetings family's same problem
across multiple tables. The rule prevents the recurrence.

---

## §1 — What the comment must contain

Minimum content:

1. The target table and column (the FK target).
2. The semantic role (one short clause).

Example:

```sql
COMMENT ON COLUMN coc_events.actor_resource_id IS
  'FK -> resources(id). The resource (not user) who performed the action; resolve via accord_user_to_resource() helper when actor is identified user-side.';
```

Length guidance: 1–2 sentences. The comment is reference, not
prose.

---

## §2 — When the rule fires

Apply at column creation time for new columns. For existing
columns surfaced as needing annotation (CMD-A1.5 surfaced
several), the annotation lands in the next brief that touches
the table — not opportunistically in unrelated CMDs.

For columns where the convention is *expected* by readers
(`firm_id` → `firms(id)`, `user_id` → `users(id)` when the table
is in the same domain cluster), no annotation is required. The
rule targets the cases where the convention misleads.

---

## §3 — Cross-module application

Every coding agent creating new columns with non-obvious FK
targets, across all ProjectHUD modules. The annotation is
permanent metadata; it survives schema dumps, migrations, and
backups.

Module documentation files (inventories, briefs, READMEs) are
also valid places for FK target documentation, but they
**supplement** the column comment rather than replacing it. The
column comment is the durable, schema-resident form; everything
else is convenience reference.

---

*Iron Rule 49 ratified 2026-05-04.*

# Iron Rule 50 — Ratification

**Status:** ratified 2026-05-04
**Authority:** operator + architect
**Scope:** every brief specifying behavioral verification of an
Edge Function, RPC, or any code path that depends on JWT-derived
context

---

## Rule

**Behavioral verification of code paths depending on
`auth.uid()`, `my_firm_id()`, `request.jwt.claims`, or any
JWT-derived context cannot be performed via the Supabase SQL
editor's `postgres` role context. It must be performed via
authenticated HTTP requests.** The brief specifying the
verification names the HTTP-based mechanism explicitly; SQL-only
verification of these paths is forbidden.

---

## Why this rule exists

CMD-A2's `my_firm_id()` returned `NULL` in the SQL editor because
the editor's session runs as the `postgres` role, which carries
no JWT. The Edge Function callable via authenticated HTTP works
correctly because the request carries the JWT and `my_firm_id()`
resolves against `request.jwt.claims`.

The brief's verification script was SQL-only. The agent caught
the trap and surfaced it as a finding, but the brief had created
the trap in the first place. The rule prevents future briefs from
specifying SQL-only verification for JWT-dependent code.

The cross-firm probe in CMD-A2 was deferred because the SQL-only
mechanism couldn't reproduce the firm-isolation behavior. The
rule eliminates this category of deferral by requiring HTTP-based
verification from the brief stage.

---

## §1 — What the rule requires

Briefs that specify verification of JWT-dependent code paths
include:

1. **An HTTP-based verification mechanism.** Examples:
   - cURL commands with `Authorization: Bearer <token>` headers
   - Browser dev console calls via `API.*` methods
   - Edge Function tests using the Supabase JS client
   - Postman / Hoppscotch collections
2. **Explicit token-acquisition steps** for the test users —
   how to authenticate as user A and user B, where the tokens
   come from.
3. **The expected response shapes** for both happy-path and
   isolation-miss cases.

SQL-only verification (a `*_verification.sql` script that the
operator runs in SQL editor) is acceptable only for code paths
that do NOT depend on JWT context. RLS policies that use
`auth.uid()` or `my_firm_id()` are JWT-dependent and require
HTTP-based verification.

---

## §2 — Hybrid verification is acceptable

A brief may specify:

- A SQL script that sets up fixture data (no JWT dependency
  during fixture creation)
- An HTTP-based verification phase that exercises the
  JWT-dependent code paths
- A SQL-based teardown / inspection phase that confirms the
  state after the HTTP phase

This is the canonical pattern. Setup → exercise → inspect.

---

## §3 — When this rule does NOT apply

The rule does NOT fire for:

- Pure schema-introspection tests (`information_schema` queries,
  constraint verification) that don't depend on row-level
  visibility.
- Functions explicitly marked `SECURITY DEFINER` that bypass RLS
  and do not call `auth.uid()` themselves.
- Migration validation (does the table exist? does the trigger
  fire?) that doesn't depend on identity context.

The rule fires for: anything where row visibility, function
authorization, or RLS enforcement matters. If the doctrinal
commitment being tested is "user A cannot see user B's data,"
that test must hit the wire.

---

## §4 — Cross-module application

The rule applies to every brief authored across ProjectHUD that
specifies behavioral verification. It applies whether the
verification target is an Edge Function, a PostgREST endpoint, a
direct table query, or any RPC.

Briefs that specify only SQL-script verification for
JWT-dependent code are doctrinally incomplete. The architect
revises before commissioning; the agent halts and surfaces if
discovered mid-execution.

---

*Iron Rule 50 ratified 2026-05-04.*
