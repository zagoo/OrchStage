# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. These are not suggestions. **These are rules. Follow them** and you'll produce code that doesn't need to be rewritten.

## 1. Read Before You Write

The single biggest source of bad LLM code is not reading the existing codebase before writing new code. You see a task, you pattern-match to something in your training data, and you start generating. This is almost always wrong.

Before writing anything:

- Read the files you're about to modify. Not skim. Read.
- Look at how similar things are done elsewhere in the project. If there's a pattern for API routes, follow that pattern. If there's a utility function that does half of what you need, use it.
- Check the imports at the top of the file. They tell you what libraries this project actually uses. Don't introduce axios if the project uses fetch everywhere. Don't introduce lodash if the project uses native methods.
- Look at the test files. They tell you what the expected behavior actually is, not what you think it should be.

The failure mode here is obvious: you generate "correct" code that's completely alien to the codebase it lives in. It works but it looks like a different person wrote it (because a different entity did). The human then has to either rewrite it to match the project style or live with inconsistency forever. Both are bad.

If you're not sure how something is done in this project, say so. "I don't see a pattern for X in the codebase, should I follow the approach in Y or do something different?" is always better than guessing.

## Rule 2. Think Before Coding

Don't start writing code until you've figured out what you're actually doing. This sounds obvious but it's the most common failure mode.

What this looks like in practice:

**State your assumptions.** If the user says "add authentication" that could mean session cookies, JWTs, OAuth, basic auth, or five other things. Don't pick one silently. Say "I'm assuming you want JWT-based auth with refresh tokens, stored in httpOnly cookies. If you want something different, let me know." If you're wrong, you've lost 10 seconds. If you silently guess wrong, you've lost an hour.

**Name the tradeoffs.** Almost every implementation choice has a tradeoff. If you're adding caching, say "this trades memory for speed and introduces cache invalidation as a thing we now have to think about." The user might say "actually I don't want that complexity." Better to know before you write 200 lines.

**If multiple approaches exist, present them briefly.** Not five. Two, maybe three. With a recommendation. "There are two ways to do this. Option A is simpler but doesn't handle edge case X. Option B handles everything but adds a dependency on Z. I'd go with A unless you expect X to actually happen."

**If something is confusing, stop.** Don't fill confusion with plausible-sounding code. The result of generating code when you don't understand the requirements is code that passes a casual review but fails when it matters. Just say what's confusing and ask.

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## Rule 3. Simplicity First

Write the minimum amount of code that solves the problem. Not the minimum amount of code you can imagine theoretically solving the problem. The minimum amount that actually solves this specific problem right now.

The instinct to over-engineer is strong. Resist it. Here's what over-engineering looks like in practice:

**Premature abstraction.** You need to send one type of email. You write an EmailService class with a strategy pattern that supports multiple providers, template engines, and retry policies. The user wanted `sendWelcomeEmail(user)`. Write that function. If they need more later, they'll ask.

```python
# bad: you wrote this
class EmailService:
    def __init__(self, provider: EmailProvider, template_engine: TemplateEngine):
        self.provider = provider
        self.template_engine = template_engine

    async def send(self, template: str, context: dict, recipient: str, **kwargs):
        rendered = self.template_engine.render(template, context)
        await self.provider.send(recipient, rendered, **kwargs)

# good: you should have written this
async def send_welcome_email(user):
    body = f"Welcome {user.name}! Your account is ready."
    await send_email(to=user.email, subject="Welcome", body=body)
```

**Speculative error handling.** You wrap everything in try/catch blocks for errors that can't happen. You validate inputs that come from your own code and are already validated upstream. You add null checks on values that are never null. Every line of error handling is a line someone has to read and understand. Only handle errors that can actually occur.

**Unnecessary configurability.** You make the batch size a parameter. You make the retry count configurable. You add environment variables for things that will never change. Configuration is not free. Every config option is a decision someone has to make and a value someone has to set correctly. Hardcode things until there's a real reason not to.

**Dead flexibility.** Interfaces with one implementation. Abstract base classes with one child. Generic type parameters that are only ever instantiated with one type. These things have a cost (cognitive overhead, indirection, more files to navigate) and zero benefit until a second implementation actually exists.

The test for simplicity: show your code to someone unfamiliar with the project. If they have to ask "why is this abstracted like this?" and the answer is "in case we need to..." then you've over-engineered it. "In case we need to" is not a requirement. It's a guess about the future, and guesses about the future are usually wrong.

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## Rule 4. Surgical Changes

When you edit existing code, your diff should be as small as possible. Every line you change is a line that could introduce a bug, a line someone has to review, and a line that shows up in git blame forever.

Rules:

**Don't touch what you weren't asked to touch.** If you're fixing a bug in function A and you notice function B has a weird variable name, leave it. If function C has a comment with a typo, leave it. If the import order doesn't match your preference, leave it. Your job is to fix the bug in function A.

**Match the existing style.** If the file uses single quotes, use single quotes. If the file uses `snake_case`, use `snake_case`. If the file has no semicolons, don't add semicolons. If the file uses `var` (yes, even in 2025), use `var` in your additions unless the user asked you to modernize. Consistency within a file beats your personal preference.

**Clean up after yourself, not after others.** If your change makes an import unused, remove that import. If your change makes a variable unused, remove that variable. If your change makes a function unused, remove that function. But only if YOUR change caused it. Pre-existing dead code is not your problem unless someone asked you to clean it up.

**Don't reformat.** Don't run prettier on a file that wasn't formatted with prettier. Don't change indentation from 4 spaces to 2. Don't reorder imports alphabetically if they weren't alphabetical before. Reformatting creates massive diffs that hide your actual changes and make code review painful.

The test: look at your diff. Can you justify every single changed line with a direct connection to what was asked? If any line is there because "while I was in there I thought I'd..." then revert it.

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## Rule 5. Verification

The difference between code that works and code you think works is testing. You should be paranoid about this distinction.

**Write the test first when fixing bugs.** Before you fix anything, write a test that reproduces the bug. Run it. Watch it fail. Then fix the bug. Run the test. Watch it pass. This is not optional and not TDD dogma. It's the only way to prove you actually fixed the thing and didn't just make the symptoms go away.

**Run existing tests before and after your changes.** If tests passed before your change and fail after, you broke something. This is obvious. What's less obvious: if tests were already failing before your change, say so. Don't silently ignore pre-existing failures and let your changes get blamed for them.

**Don't write tests for the sake of writing tests.** A test that checks whether a constructor sets properties is worthless. A test that checks whether your validation actually rejects bad input is valuable. Test behavior, not implementation. Test the interesting cases, not the trivial ones.

**If you can't write a test, say why.** Sometimes the architecture makes testing hard. That's useful information. "I can't easily test this because the database calls are tightly coupled to the business logic" is a signal that something might need to be restructured. Don't just skip testing and hope.

## Rule 6. Goal-Driven Execution

Every task should have a clear success criterion before you start writing code. If the criterion is vague, make it specific. If you can't make it specific, ask.

Transform vague tasks into verifiable ones:

- "Add validation" becomes "reject inputs where email is missing or invalid, return 400 with a message that says what's wrong, add tests for both cases"
- "Fix the bug" becomes "write a test that reproduces the reported behavior, make the test pass, verify existing tests still pass"
- "Improve performance" becomes "profile first, identify the bottleneck, fix that specific thing, measure again"

For anything that takes more than one step, state the plan before executing:

```
Plan:
1. Add the new database column with a migration
2. Update the model to include the new field
3. Modify the API endpoint to accept and return the field
4. Add validation for the field
5. Write tests for the new behavior
6. Run full test suite to check for regressions
```

This does two things: it lets the user catch mistakes in your approach before you waste time implementing them, and it forces you to actually think through the steps instead of just diving in and figuring it out as you go.

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## Rule 7. Debugging

When something doesn't work, don't guess. Investigate.

**Read the error message.** The whole thing. Including the stack trace. LLMs have a terrible habit of seeing an error and immediately generating a "fix" based on the error type without reading what it actually says. A TypeError could mean a hundred different things. The message and stack trace tell you which one.

**Reproduce first.** Before you change anything, make sure you can reproduce the problem. If you can't reproduce it, you can't verify your fix. "I think this should fix it" is not debugging. It's gambling.

**Change one thing at a time.** If you change three things and the bug goes away, you don't know which change fixed it. You also don't know if the other two changes introduced new bugs. Change one thing. Test. Change another. Test.

**Don't add workarounds without understanding the root cause.** If a value is unexpectedly null, don't just add a null check and move on. Figure out why it's null. The null check might prevent a crash, but the underlying bug is still there and will manifest differently later.

**If you're stuck, say so.** "I've tried X and Y and neither worked. Here's what I'm seeing. I think the issue might be Z but I'm not sure." This is infinitely more useful than silently trying random things for 20 iterations.

## Rule 8. Dependencies

Don't add dependencies without thinking about it.

Every dependency you add is code you don't control that becomes a permanent part of the project. It needs to be maintained, updated, audited for security issues, and understood by everyone on the team. The cost is almost always higher than it looks.

Before adding a package:

- Can you do this with what's already in the project? If the project has axios, don't add node-fetch. If the project uses date-fns, don't add moment.
- Can you do this with the standard library? You don't need lodash for `Array.prototype.map`. You don't need uuid if `crypto.randomUUID()` exists.
- Is this dependency actually maintained? Check the last commit date. Check the issue count. Check if the maintainer responds to issues.
- How big is it? If you're adding a 500KB package to format a date, that's probably not worth it.

When you do add a dependency, say why. "I'm adding zod because this project needs runtime schema validation and there's nothing in the existing dependencies that does this" is fine. Silently adding packages to package.json is not.

## Rule 9. Communication

How you communicate about code matters as much as the code itself.

**Say what you did and why.** Don't just dump a code block. "I moved the validation logic into a separate function because it was duplicated in three endpoints. This also makes it testable independently." Now the user understands the change without reading every line.

**Flag concerns.** If you implemented what was asked but you think there's a problem with the approach, say so. "This works but it makes a database call for every item in the list. If the list gets large this will be slow. Want me to batch it?" is the kind of proactive communication that saves hours later.

**Be precise about what you're uncertain about.** "I'm not sure if this library supports streaming responses" is useful. "I think this should work" is not. The difference is that the first one tells the user exactly what to verify.

**Don't explain things the user already knows.** If they asked you to add a REST endpoint, don't explain what REST is. If they asked for a database index, don't explain what indexes do. Match your explanation level to the user's demonstrated knowledge.

**Commit messages matter.** If you're writing a commit message, make it specific. "Fix bug" is useless. "Fix null pointer in user lookup when email contains uppercase chars" tells the next person exactly what happened.

## Rule 10. Common Failure Modes

These are the patterns I see most often. If you catch yourself doing any of these, stop and reconsider.

**The Kitchen Sink.** Asked to add one feature, you restructure half the codebase "while you're at it." Don't. Do the one thing.

**The Wrong Abstraction.** You build a beautiful generic solution to a problem that only exists in one place. Duplication is far cheaper than the wrong abstraction. Copy-paste twice before you abstract.

**The Invisible Decision.** You make an architectural choice (database schema, API shape, auth strategy) without flagging it as a decision. These choices are hard to reverse and the user should be aware you made them.

**The Optimistic Path.** You write code that handles the happy path perfectly and ignores or crashes on everything else. Think about what happens when the API returns 500. When the file doesn't exist. When the user submits an empty form.

**The Knowledge Hallucination.** You confidently use an API that doesn't exist, a parameter that was removed two versions ago, or a library feature you're imagining. If you're not 100% sure a method exists with this exact signature, say so. Check the docs. Look at the actual source code in the project.

**The Style Drift.** You write code in your "preferred" style instead of matching the project. Functional patterns in an OOP codebase. Classes in a functional codebase. TypeScript patterns in a JavaScript project. Match the codebase, not your preferences.

**The Runaway Refactor.** You start fixing one thing. It touches another thing. That touches another. Twenty minutes later you've changed 15 files and you're not sure what you originally set out to do. If a fix is cascading, stop. Tell the user what's happening. Get buy-in before continuing.

## Rule 11. Before writing any frontend code, read ARCHITECTURE.md in full.
All frontend code must strictly adhere to it. Treat these as hard rules — not defaults to override.

Non-negotiables:
1. Tech stack lock-in (per §1, §2.4, §2.7): Vue 3 (Composition API + `<script setup lang="ts">`) + TypeScript + 
   Tailwind CSS + Lucide Icons (imported via 'lucide-vue-next'), Vite (with `/api` reverse proxy to FastAPI), Vue Router (centralized + module auto-aggregation), Pinia (decentralized, independent stores; setup-store pattern), VueUse, vue-echarts — and nothing else. No Vuex, no alternative HTTP clients, no React/Svelte patterns, no UI kits not already in `package.json`. If a need arises that isn't covered, STOP and surface it before installing anything.
2. Module-first thinking: Before creating any file, name the target `views/[module_name]/`. A new feature = a new 
   module directory. Never spread one feature across multiple modules; never mix two features into one module.
3. Directory placement is mandatory (per §3): Files must land in the exact slots of the unified `frontend/src/` 
   tree. Module-private code lives under `views/[module]/{api,components,hooks,store}/`. Global code lives only under `src/{assets,components,composables,router,store,api/generated}/`.
4. API client SSOT (per §2.5, §4.1): Never write raw HTTP/fetch/axios calls and never hand-write TypeScript 
   interfaces for backend payloads. The entire client and all wire types are generated by `@hey-api/openapi-ts` from FastAPI's `/openapi.json` into `src/api/generated/` (DO NOT MANUALLY MODIFY). A hand-written `src/utils/request.ts` is forbidden. Each module's `views/[module]/api/index.ts` is a thin re-export facade exposing only the subset of generated services and types that module consumes.
5. Routing isolation (per §4.2): Add routes by creating `src/router/modules/[module].ts`. 
   NEVER edit `src/router/index.ts` directly — it auto-aggregates via `import.meta.glob`.
6. The 3-module rule (per §4.3): Do not promote a component, hook, or store to a global directory unless it is 
   currently consumed by ≥3 separate business modules. When in doubt, keep it local. Premature globalization is a regression.
7. Destruction safety (per §4.3): After your changes, `rm -rf src/views/[module]` plus deleting the module's 
   route file MUST leave the project compiling with zero errors and zero dead references. If your design fails this test, you have leaked cross-module coupling — refactor before reporting done.
8. Logic/UI separation (per §1 Component Building Principles): Stateful logic, side effects, and non-trivial 
   computation belong in composables under the module's `hooks/`. `.vue` files = template + minimal glue. No fetch calls or business branching inline in templates.
9. Component communication: Only `props` down / `emits` up. No cross-module imports of private components, no 
   `provide/inject` across module boundaries, no global event bus, no reaching into another module's store.
10. TypeScript strictness: Strong types for component props/emits and store state. Backend payload types MUST 
    come from `src/api/generated/types.ts` — never hand-duplicated. No `any` escape hatches; no `// @ts-ignore` without a one-line justification.
11. Auth via interceptors only (per §2.6): JWT access tokens flow through interceptors mounted on 
    `src/api/generated/client.ts`. Silent, seamless refresh on Access Token expiration is the only valid 
    handling — never surface a raw 401 to the UI. Auth state lives in `src/store/auth.ts`.
12. Response envelope handling (per §2.3): Every API response is wrapped as `{code, message, data}`. 
    Treat `code != 0` as a domain error and route it through unified error UX — never inspect HTTP status alone for domain outcomes. Paginated payloads come through the standardized nested generic.
13. Reactivity and charts (per §2.7): Use VueUse composables for any window/element/debounce/v-model reactivity. 
    Use vue-echarts with on-demand ECharts module imports — never the full ECharts bundle.
14. Don't touch global scope unprompted: Unless explicitly told to refactor, do not modify `src/components/`, 
    `src/composables/`, `src/store/`, `src/api/generated/`, `src/router/index.ts`, or any other module's files.

Before reporting done, output a checklist confirming each rule above. For every file created or modified, state: (a) which module it belongs to, (b) which directory slot it occupies, (c) whether any file outside that module was touched and why. If any rule was bent, flag it explicitly with the reason. Don't hide deviations.

## Rule 12. Before writing any backend code, read ARCHITECTURE.md in full.
All backend code must strictly adhere to it. Treat these as hard rules — not defaults to override.

Non-negotiables:
1. Tech stack lock-in (per §2.1, §2.2): FastAPI with `async/await` end-to-end, SQLAlchemy 2.0+ using `Mapped[...]` + `mapped_column()` type-annotated declarations (no v1.x patterns), `AsyncSession` for every DB interaction, PostgreSQL (latest stable), Alembic for migrations, Pydantic for schemas, PyJWT for tokens — and nothing else. No raw SQL, no manual schema updates, no deprecated SQLAlchemy v1.x syntaxes, no sync ORM sessions. If a need arises that isn't covered, STOP and surface it before installing anything.
2. Migrations only via Alembic (per §2.1): Every schema change lands as a versioned revision under `backend/alembic/versions/`. Manual `ALTER TABLE`, `Base.metadata.create_all()` in production paths, or hand-edited schemas are forbidden.
3. Async end-to-end (per §2.2): Every endpoint, service, dependency, and DB call is `async def`. Blocking I/O (sync HTTP clients, sync file ops, `time.sleep`) inside the request path is forbidden. Never mix sync and async sessions.
4. Domain-bounded routers: API endpoints are split across `backend/app/routers/[domain].py` files keyed by business domain. Never create a god-router or co-mingle unrelated domains in one file. Mount each router on a domain-prefixed path in `main.py`.
5. Schema separation (per §2.3): Persistence models live in `backend/app/models/`. Wire-level payloads live in `backend/app/schemas/`. Never expose a SQLAlchemy model directly as a response — always serialize through a Pydantic schema. Use separate schemas for create/update/read where they diverge.
6. Response envelope is the contract (per §2.3): Every endpoint returns `ApiResponse[T]` containing `code: int` (business status), `message: str`, `data: Optional[T] = None`. Paginated endpoints return `PageData[T]` nested inside `data`. No bare lists, no raw dicts, no HTTP-status-only signaling for domain outcomes.
7. OpenAPI is the SSOT for the frontend (per §2.5): `/openapi.json` is consumed by `@hey-api/openapi-ts`. Every endpoint must have typed request/response models, accurate status codes, and stable `operation_id`s. Renaming a model, changing a status code, dropping a field, or altering an `operation_id` is a breaking change to the frontend — surface it explicitly before merging.
8. Authentication is Dual-Token JWT (per §2.6): Login issues a short-lived Access Token (HTTP header) and a long-lived Refresh Token. Implement the refresh endpoint that supports the frontend's silent-refresh flow. Password hashing and JWT encode/decode live only in `backend/app/core/security.py`. No homegrown crypto, no scattering of `jwt.encode` across routers.
9. Configuration via env vars only: Settings flow through `backend/app/core/config.py` (Pydantic Settings). No hardcoded secrets, URLs, ports, or tokens. No reading `.env` directly from business code.
10. Directory placement is mandatory (per §3): Files must land in the exact slots of the `backend/` tree. Don't introduce parallel directories or scatter modules across unrelated paths.
11. Don't touch global scope unprompted: Unless explicitly told to refactor, do not modify `backend/app/core/`, `backend/app/database.py`, `backend/app/main.py`, the Alembic environment, or unrelated routers.
12. When generating create/upsert logic, do not treat a soft-deleted record with the same business key as a simple duplicate-exists failure. If the business key matches only soft-deleted data, and the data can be made effective without violating integrity, uniqueness, foreign-key constraints, audit requirements, or domain invariants, implement the normal business flow that makes the requested data active/effective again, such as restoring/reactivating the existing record or applying another domain-appropriate recreation strategy. Only reject the request when an active duplicate already exists or when recreation is unsafe, and in that case return a specific domain/integrity error rather than a generic duplicate error.
13. When generating code for APIs that return paginated results, **do not paginate in application memory**. All pagination must be performed at the database level using `LIMIT`/`OFFSET` or equivalent mechanisms, and total row counts should be computed efficiently in the database. Additionally, for any tables involved in paginated queries, appropriate indexes (such as composite indexes or INCLUDE columns) **must be created and utilized** to ensure queries remain performant and scalable. The generated code should follow these rules strictly to avoid full table scans or memory-intensive operations.
14. When generating code that performs aggregation, summarization, statistics, grouping, counting, or table-wide calculations, always execute those computations in the database layer using SQL or ORM-equivalent constructs such as `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY`, `HAVING`, window functions, materialized views, or other database-supported mechanisms. Do **not** load all matching rows into application memory and then aggregate them with application code. The generated code must push filtering, joining, grouping, and aggregation into the database query, and should return only the computed result set needed by the application.

Before reporting done, output a checklist confirming each rule above. For every file created or modified, state: (a) which domain/router it belongs to, (b) which directory slot it occupies, (c) whether the OpenAPI surface changed and how, (d) whether any file outside that domain was touched and why. If any rule was bent, flag it explicitly with the reason. Don't hide deviations.

## Rule 13. Before writing, modifying, or reviewing any UI code, read DESIGN.md in full.
All generated UI must strictly follow the Notion product style documented in `DESIGN.md` at pixel-level fidelity. Treat these as hard rules — not defaults to override.
Non-negotiables:
1. **Read `DESIGN.md` first**
   - Before implementing any UI component, page, layout, design token, CSS, Tailwind class, style object, or frontend markup, must inspect and understand the full contents of `DESIGN.md`.
   - Must not rely on memory, generic SaaS defaults, or unrelated design assumptions.

2. **Treat `DESIGN.md` as the single source of truth**
   - Use the exact colors, typography, spacing, radius, component patterns, shadows, responsive behavior, and layout rules defined in `DESIGN.md`.
   - If a UI decision is not explicitly specified elsewhere, default to the closest Notion-style pattern described in `DESIGN.md`.

3. **Strictly copy the Notion visual style**
   - The generated UI must look like a pixel-level copy of the Notion product style described in `DESIGN.md`.
   - This includes the deep navy hero band, centered editorial layout, purple primary CTA, pastel feature cards, Notion-Sans typography, warm charcoal text, hairline borders, restrained shadows, workspace mockup cards, and dense pricing/comparison-table patterns.

4. **Use exact design tokens**
   - Use `#5645d4` for the primary CTA purple.
   - Use `#0a1530` for dark navy hero sections.
   - Use `#ffffff` for primary canvas surfaces.
   - Use `#f6f5f4` for subtle surfaces.
   - Use `#e5e3df` and related hairline colors for borders.
   - Use the pastel tint palette exactly as defined in `DESIGN.md`.

5. **Respect Notion geometry**
   - Buttons must use 8px radius and must not be pill-shaped.
   - Cards must use 12px radius.
   - Pill radius is only allowed for badges, pill tabs, and status chips.
   - Avoid over-rounded, glossy, neumorphic, glassmorphic, or generic startup-style UI.

6. **Respect Notion typography**
   - Use Notion Sans or the configured Notion-Sans-compatible stack everywhere.
   - Use the typography scale from `DESIGN.md`, including tight display leading and negative letter-spacing on large headings.
   - Do not substitute unrelated typefaces or arbitrary font sizes.

7. **Respect component behavior**
   - Primary buttons must follow `button-primary`.
   - Secondary buttons must follow `button-secondary` or `button-secondary-on-dark`.
   - Inputs must follow `text-input`.
   - Search bars must follow `search-pill`.
   - Feature cards must follow the defined pastel card variants.
   - Pricing cards and comparison tables must follow the pricing components in `DESIGN.md`.

8. **Respect responsive behavior**
   - Follow the breakpoints and collapsing strategy in `DESIGN.md`.
   - Hero typography must scale down according to the documented responsive sizes.
   - Pricing cards must collapse from 4-column desktop to 2-column tablet to 1-column mobile.
   - Feature cards must collapse from 3-column desktop to 2-column tablet to 1-column mobile.
   - Navigation must collapse below the documented desktop breakpoint.

9. **Never use a native `<select>` for a styled dropdown.**
   - Native `<option>` popups cannot be styled (borderless rows, hover color, width/position) and clip inside
   `overflow:auto` modals and panels.
   - Use the shared custom listbox component (`SelectMenu`) for every dropdown, and route label+control rows (`DropdownRow`) through it.
      - Trigger (must match the text-input field exactly)
      - Popup (dimensions & position align seamlessly with the field)
      - Options (dynamic, borderless)
      - API & accessibility (parity with native `<select>`)

10. **every top-level / parent nav item has a unique, theme-aligned icon.**
   - Never repeat a generic placeholder (e.g. `box`) across multiple groups.
   - Icons come from the single Lucide outline family via `AppIcon` (16px in nav, `stroke-width:1.6`); register a semantic key in `AppIcon.vue` before use. No mixing families.
   - Choose a glyph that depicts the group's domain, distinct from sibling groups (and, where practical, from its own child items).

11. **Do not introduce conflicting visual systems**
   - Do not use Material Design, Bootstrap defaults, shadcn defaults, Ant Design defaults, Tailwind UI defaults, Apple-style glassmorphism, Linear-style gradients, or generic B2B SaaS aesthetics unless they are restyled to match `DESIGN.md`.
   - Any third-party component must be visually overridden to match the Notion style from `DESIGN.md`.

12. **Validate UI output against `DESIGN.md`**
    - After writing UI code, must mentally compare the result against `DESIGN.md`.
    - If any color, radius, typography, spacing, shadow, layout, or component treatment conflicts with `DESIGN.md`, must revise it before finalizing.

Before reporting done, output a checklist confirming each rule above.
If any rule was bent (and why), flag it explicitly. Don't hide deviations.

## Rule 14. Before writing any UI for this SPA, conform to the layout system specified in this rule.
This rule governs STRUCTURE and COMPONENT COMPOSITION only — visual tokens (colors, type, radii, and surface tones, etc.) continue to come from Rule 6 / DESIGN.md.Treat these as hard rules — not defaults to override.

App-shell structure (non-negotiable):
1. Three-pane shell: left nav (~256px) | center content (fluid) | right config
   panel (~360px). Left and right panels collapse independently; center reflows.
   Keep the left nav and right config panel fixed while the Center pane scrolls.
   There is NO top app bar spanning the panes.
2. Routing changes the center pane only. Pages never render their own shell.
3. Build one `<AppShell>` with named slots: `nav-header`, `nav-primary`,
   `nav-footer`, `content-toolbar`, `content`, `content-footer`, `panel-header`,
   `panel-body`. Every page mounts into these slots.

Left sidebar (non-negotiable):
4. Top → bottom order: product header (name + workspace switcher) → primary nav
   → spacer → utility links (e.g.,Search, What's new, Settings, etc.) → user identity chip.
   dynamically size the middle spacer to fit the viewport height, keeping the header and footer fully visible.
5. Primary nav rows are icon + label. Parents expand INLINE to reveal children
   — no flyouts, no separate routes for hub pages. Selected state is a soft
   rounded fill on the row, never a side border.

Center pane (non-negotiable):
6. Toolbar: left cluster = sidebar-collapse button + page title; right cluster
   = contextual icon actions (e.g.,share, fullscreen, add, etc.). No tabs here.
7. Page heading is large display text per DESIGN.md. Mode toggles (e.g.,
   Models / Agents) use a right-aligned segmented pill placed in the content
   next to the heading, never in the toolbar.
8. Card grids: 3 cols at desktop, 2 at tablet, 1 at mobile. Each card composes:
   tinted square icon (~32px) top-left → title → description. Use card surface
   tokens from DESIGN.md.
9. The Center pane dynamically renders the actual content of the corresponding page 
   according to the item clicked in the Primary Navigation area on the Left sidebar.

Right configuration panel (non-negotiable):
10. Header: panel title + utility actions + close (×), the height is exactly the same as 
    that of the toolbar on the Center pane.
11. Body is a vertical stack of collapsible labeled sections. Inside a section:
    label above the control, control fills width, toggle rows have the label
    filling the row and the switch right-aligned.
12. The panel pushes content; it never overlays. On narrow viewports it
    becomes a slide-over with backdrop.

Component composition (non-negotiable):
13. Reuse a single set of primitives: `<NavItem>`, `<ToolbarIconButton>`,
    `<SegmentedControl>`, `<SettingsSection>`, `<ToggleRow>`, `<DropdownRow>`,
    `<ContentCard>`, `<PromptComposer>`. Do not fork — extend via props/slots.
14. One icon family, outline style. 16px in nav/toolbars, 20px in content.
    Never mix icon families.

Before reporting done, output a checklist confirming each rule above. For
every page or component added, state: (a) which AppShell slots it fills,
(b) which primitives it reuses, (c) any new primitive introduced and why an
existing one could not be extended. If a rule was bent, flag it explicitly.
Don't hide deviations.

## Rule 15. Use the model only for judgment calls
Use me for: classification, drafting, summarization, extraction.
Do NOT use me for: routing, retries, deterministic transforms.
If code can answer, code answers.

## Rule 16. Token budgets are not advisory
Per-task: 4,000 tokens. Per-session: 30,000 tokens.
If approaching budget, summarize and start fresh.
Surface the breach. Do not silently overrun.

## Rule 17. Surface conflicts, don't average them
If two patterns contradict, pick one (more recent / more tested).
Explain why. Flag the other for cleanup.
Don't blend conflicting patterns.

## Rule 18. Read before you write
Before adding code, read exports, immediate callers, shared utilities.
"Looks orthogonal" is dangerous. If unsure why code is structured a way, ask.

## Rule 19. Tests verify intent, not just behavior
Tests must encode WHY behavior matters, not just WHAT it does.
A test that can't fail when business logic changes is wrong.

## Rule 20. Checkpoint after every significant step
Summarize what was done, what's verified, what's left.
Don't continue from a state you can't describe back.
If you lose track, stop and restate.

## Rule 21. Match the codebase's conventions, even if you disagree
Conformance > taste inside the codebase.
If you genuinely think a convention is harmful, surface it. Don't fork silently.

## Rule 22. Fail loud
"Completed" is wrong if anything was skipped silently.
"Tests pass" is wrong if any were skipped.
Default to surfacing uncertainty, not hiding it.

---
**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
