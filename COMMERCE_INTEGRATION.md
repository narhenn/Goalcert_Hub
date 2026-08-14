# Hub → LMS commerce integration

The Hub is the commerce authority. Modules, plans, pricing, subscriptions and
money live there. The LMS executes: it hosts the courses and enforces the limits
a plan grants.

When someone buys the LMS in the Hub, a tenant is created in the LMS
automatically, on the plan they bought, with no duplicate accounts and no
second password.

Companion to `SSO.md`, which covers how people sign in.

---

## 1. What moves, and which way

```
  HUB (authority)                              LMS (execution)
  ─────────────────                            ─────────────────
  Module 'lms'
    └─ Plan  Starter/Growth/Scale/Ent+  ──push──►  packages     (mirror, read-only)
         limits {}, features []                     storage_limit, course_limit,
                                        ◄──pull───   student_limit, features …
                                    (hub:sync-plans)

  Organization ─────────────provision─────────►  users          (the tenant)
  Subscription (active) ──────────────────────►  memberships    (plan + expiry)
                                                 user_permissions (features)
                                                 hub_tenant_links (the pairing)

  Subscription (cancelled/expired) ───sync────►  membership expired
```

Four endpoints on the LMS, all HMAC-authenticated:

| Endpoint | Called when |
|---|---|
| `POST /api/hub/plans/sync` | a plan is created, edited or withdrawn in the Hub |
| `POST /api/hub/tenants/provision` | a purchase completes |
| `POST /api/hub/subscriptions/sync` | renewal, upgrade, cancellation, expiry |
| `GET /api/hub/tenants/{orgId}` | the Hub wants the LMS's real view of a tenant |
| `GET /api/hub/health` | connectivity and shared-secret check |

Plus one on the Hub for the pull direction: `GET /api/integration/plans`.

### Why plans are mirrored rather than queried live

Every limit check in the LMS is a synchronous read on a `packages` row —
`UserPermissionHelper::currentPackage()`, `LimitCheckerHelper`, `CheckPackage`,
`UserPermission`. Putting an HTTP call to the Hub on that path would place the
Hub on the critical path of ordinary page loads and take the LMS down with it.
The LMS keeps a local copy and keeps working whether or not the Hub is up.

### Push plus pull

The Hub pushes changes as they happen. `php artisan hub:sync-plans` pulls and
reconciles, for the case where a push was missed — the LMS was mid-deploy, a
request was dropped, someone edited the Hub database directly. Safe to run on a
schedule.

### Failures never undo a sale

Every outbound call from the Hub is best-effort. By the time `lms_sync` runs,
the money has already moved and the subscription is committed. A briefly
unreachable LMS must not roll that back — it is logged, and either
`hub:sync-plans` or a re-grant reconciles.

---

## 2. Package management is now read-only in the LMS

Per the decision taken: the Packages screens stay, the write paths are closed.

- **Read routes** (`packages`, `package/{id}/edit`, `package/features`,
  `package/settings`, `addon-price-lists`) still work. An admin can still see
  which plan a tenant is on without leaving the panel.
- **Write routes** carry `packages.readonly`
  (`App\Http\Middleware\PackagesManagedByHub`), which refuses with
  *"Plans and packages are managed in Goalcert Hub. This screen is read-only."*
- The UI hides Add / Delete / Update and the bulk-select checkboxes, shows a
  **Managed in Goalcert Hub** banner with an *Open Hub* link, relabels Edit to
  **View**, and badges Hub-owned rows with **Hub**.
- Nothing was deleted. No controller, route, view, sidebar entry or permission
  was removed.

**To hand package management back**: set `HUB_API_ENABLED=false`, or drop
`packages.readonly` from the write routes in `routes/admin.php`. Both restore
the previous behaviour exactly.

The guard is server-side; `gcPackagesReadOnly()` only hides controls in blade
and is never the only thing standing between a request and a write.

---

## 3. Existing data is untouched

Per the decision taken — **Hub governs new only**:

- The 3 legacy packages (Core, Plus, Enterprise) have `hub_plan_id = NULL`. The
  sync never reads, writes or deactivates them.
- All 11 existing memberships keep pointing at them and keep working.
- Hub plans arrive as **new** package rows tagged with their `hub_plan_id`.

Verified after a live sync: 3 legacy packages intact, 11 memberships intact,
4 Hub plans imported alongside them.

A withdrawn Hub plan is **deactivated, never deleted** — `memberships.package_id`
points at it, and deleting one would strip a paying tenant of its limits
mid-term.

---

## 4. Files

### LMS — `D:\laragon\www\goalcert`

**New**

```
config/hub.php                                          integration config
routes/hub.php                                          the 5 endpoints
app/Http/Middleware/VerifyHubSignature.php              HMAC auth
app/Http/Middleware/PackagesManagedByHub.php            read-only guard
app/Http/Controllers/Api/Hub/HubIntegrationController.php
app/Services/Hub/HubPlanSyncService.php                 plans -> packages
app/Services/Hub/TenantProvisioningService.php          purchase -> tenant
app/Console/Commands/SyncHubPlans.php                   hub:sync-plans
app/Models/HubTenantLink.php
app/Models/UserSsoIdentity.php
app/Sso/Services/TenantIdentityResolver.php             tenant-side SSO
resources/views/admin/packages/partials/hub-managed-notice.blade.php
database/migrations/2026_08_03_00000{1,2,3,4}_*.php
```

**Modified**

| File | Change |
|---|---|
| `routes/api.php` | one line registering `routes/hub.php` |
| `routes/admin.php` | `packages.readonly` on the package/add-on write routes |
| `app/Http/Kernel.php` | two middleware aliases |
| `app/Http/Helpers/Helper.php` | `gcPackagesReadOnly()` helper |
| `app/Sso/Http/Controllers/HubSsoController.php` | routes admin vs tenant sessions |
| `app/Sso/Services/AdminIdentityResolver.php` | optional-failure mode |
| `config/sso.php` | `sso.tenant.*` block |
| `resources/views/admin/packages/*.blade.php` | notice + hidden write controls |
| `.env` / `.env.example` | `HUB_API_*`, `HUB_SSO_TENANT_*` |

### Hub — `hub/backend`

```
lms_client.py       NEW — signed HTTP client (transport only, no ORM)
lms_sync.py         NEW — commerce event -> LMS, plus GET /api/integration/plans
commerce_routes.py  hooks on grant/edit/cancel/update subscription + plan CRUD
server.py           +2 lines
```

---

## 5. Security

Server-to-server, no user session. Each request proves itself:

```
X-Hub-Timestamp   unix seconds, must be within ±300s
X-Hub-Nonce       unique per request, burned on first use
X-Hub-Signature   hex HMAC-SHA256 of "{timestamp}.{nonce}.{rawBody}"
```

The **body** is signed, not just the headers. Without that, an intercepted
"provision a trial" call could be edited into "provision Enterprise" and still
verify. Confirmed by test: a valid signature with a swapped body is refused.

- `HUB_API_SECRET` must be ≥ 32 characters — both sides refuse to run otherwise.
  It is **separate** from `HUB_SSO_SECRET`: different trust relationships, and
  compromising one should not hand over the other.
- Optional `HUB_API_ALLOWED_IPS` source allow-list.
- `throttle:120,1` on the route group.
- Errors log the precise reason and return only `unauthorized` to the caller.

**Replay protection needs a shared cache store on multi-node.** The nonce is
burned in Laravel's cache; `file` and `array` drivers are per-node. Set
`HUB_API_REPLAY_CACHE_STORE=redis` before scaling out. This is the one control
that degrades silently rather than failing loudly.

---

## 6. Deployment

### 6.1 Secret

```bash
openssl rand -hex 48
```

Set as `LMS_API_SECRET` on the Hub and `HUB_API_SECRET` on the LMS. Must match,
must be ≥32 chars, must differ from the SSO secret.

### 6.2 Hub — `hub/backend/.env`

```dotenv
LMS_API_BASE_URL=https://goal-cert.com
LMS_API_SECRET=<the secret>
LMS_MODULE_CODE=lms

# VR LMS — leave blank until its endpoint exists; calls become logged no-ops.
VR_API_BASE_URL=
VR_API_SECRET=
VR_MODULE_CODE=xrlms
```

### 6.3 LMS — `.env`

```dotenv
HUB_API_ENABLED=true
HUB_API_SECRET=<the same secret>
HUB_API_BASE_URL=https://hub.goal-cert.com     # for the pull direction
HUB_CONSOLE_URL=https://hub.goal-cert.com      # the "Open Hub" link
HUB_API_PLAN_MODULES=lms
HUB_API_SEND_WELCOME_EMAIL=true
HUB_SSO_TENANT_ENABLED=true
```

### 6.4 Do NOT run `php artisan config:cache` on the LMS

This is a **pre-existing** incompatibility in the LMS, not something this work
introduced — but it is a standard deploy step, so it will bite you.

The app calls `env()` at runtime in places config caching does not reach:

```
routes/web.php:38,62,116          $domain / $host checks
routes/sub_domain.php:6,15
app/Http/Middleware/Authenticate.php:21
app/Http/Helpers/Helper.php:456,460,470,483,532
app/Exceptions/Handler.php:66,78,81
```

With config cached, `.env` is not loaded, so `env('WEBSITE_HOST')` returns
`null`, the domain-scoped route groups register against a null domain, and
requests stop matching. Verified: with config cached, `GET /admin` for a
signed-in admin no longer resolves — it falls through to `Route::fallback()`,
which renders `errors/404.blade.php`, which then 500s on an undefined `$bs`.

Safe deploy commands:

```bash
php artisan config:clear     # NOT config:cache
php artisan view:clear
php artisan migrate --force
```

`route:cache` is also unusable, for the same reason — `routes/web.php` decides
which route files to register from the request host at registration time.

Fixing this properly means moving `WEBSITE_HOST` into a config file and
replacing those `env()` calls with `config()`. Worth doing, but it touches
files outside this integration, so it was left alone.

### 6.5 Migrate and seed

```bash
php artisan migrate
php artisan config:clear
php artisan hub:sync-plans --dry-run     # review
php artisan hub:sync-plans --full        # apply
```

### 6.6 Rolling back

The five migrations roll back and re-apply cleanly (verified). One hazard:

**Rolling back `000001` drops `packages.hub_plan_id`**, which orphans every
Hub-synced package — they survive as rows but lose their link to the Hub, and a
later re-sync creates duplicates rather than reattaching.

If you do roll it back, before re-migrating:

```sql
-- Hub-synced packages that no membership depends on: safe to delete,
-- the sync will recreate them.
SELECT p.id, p.title FROM packages p
LEFT JOIN memberships m ON m.package_id = p.id
WHERE m.id IS NULL AND p.id NOT IN (<your legacy package ids>);
```

Then `php artisan migrate && php artisan hub:sync-plans --full`.

### 6.7 Schedule the reconcile (recommended)

```php
// app/Console/Kernel.php
$schedule->command('hub:sync-plans --full')->hourly();
```

---

## 7. Before you sell anything: set the plan limits

**The Hub's four LMS plans currently have `limits = {}`.**

The LMS maps `limits` onto its own numeric columns
(`config/hub.php` → `plans.limit_map`). A key the Hub does not send falls back
to a conservative default — deliberately, because a missing limit must never
silently mean "unlimited". The current effect:

| Plan | storage | courses | students | instructors |
|---|---|---|---|---|
| Starter / Growth / Scale / Enterprise+ | 500 MB | 5 | 5 | 1 |

That contradicts the plans' own marketing copy ("Unlimited courses & modules"),
so the sync now **warns loudly** on every plan with no limits — in the artisan
output, in the API response, and in the log:

```
! Plan "Growth" carries no limits; the tenant will get this app's conservative
  defaults. Set limits on the plan in Goalcert Hub.
```

Set these on each plan in the Hub (Plans → edit → limits), using these keys:

```json
{
  "storage_mb": 8092,
  "courses": 100,
  "featured_courses": 20,
  "course_categories": 50,
  "modules": 200,
  "lessons": 800,
  "students": 500,
  "instructors": 20
}
```

I did not invent these numbers for you — they are a pricing decision, and
guessing them would have silently set what your customers get for their money.

### The seats question — a decision still open

The Hub prices the LMS **per seat** (`Subscription.seats`, e.g. ₹900/seat/yr).
The LMS's limits live on the `packages` row, which is **shared by every tenant
on that plan** — so writing `seats` into `student_limit` would change the limit
for everyone on that plan, not just the buyer.

For now `seats` is passed through and recorded on `hub_tenant_links.seats`, so
the figure is never lost, but it is **not enforced**. Three ways to close it:

1. **Per-tenant override via `addons_packages`** — the LMS already has this
   table for "extra students purchased". Provisioning would write a row for
   `seats − plan.students`. Fits the existing model; most work.
2. **A package per seat-tier** — Hub plans become Starter-10, Starter-50 etc.
   No LMS change; more plans to maintain.
3. **Set `students` generously on the plan** and treat seats as billing-only.
   Simplest; no technical enforcement of seat count.

Option 1 is the most faithful. Tell me which you want and I'll implement it.

---

## 8. Testing

Everything below ran against the live `goalcert_db` and the real Hub database,
over real HTTP with real HMAC signing — nothing stubbed on either side.

| Suite | Result |
|---|---|
| Hub → LMS commerce end-to-end (31 cases: connectivity, wrong secret, replay, stale timestamp, body tampering, plan sync, module filtering, idempotent re-push, provisioning, webhook redelivery, upgrade, status, cancel, renew, error handling) | 31 / 31 |
| Tenant SSO (13 cases: routing by identity, guard isolation, linking, colleague refusal, deactivated tenant, role gating, cross-audience) | 13 / 13 |
| Admin SSO (from `SSO.md`) | 42 / 42 |
| Password-login regression | 11 / 11 |
| Cross-system SSO | 10 / 10 |
| Live pull: `hub:sync-plans --full` against the running Hub | 4 plans imported, 2 stale deactivated, 4 warnings raised |
| Blade compile (all 5 package views) | clean |
| Legacy data after a full sync | 3 packages + 11 memberships intact |

Manual smoke test:

1. In the Hub, grant a tenant the `lms` module on a plan.
2. Check the response contains `provisioning: {ok: true, created: true}`.
3. In the LMS, `hub_tenant_links` has the org, `users` has one new tenant,
   `memberships` has an active row on the right package.
4. Re-grant the same subscription — no second tenant appears.
5. The buyer clicks **Open LMS** in the Hub and lands on their own dashboard.
6. LMS admin → Packages shows the Hub banner and no edit buttons.
