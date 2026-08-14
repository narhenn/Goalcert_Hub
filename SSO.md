# GoalCert Single Sign-On

The Hub is the identity provider. An admin signs in there once, clicks **Open LMS**,
and lands on `https://goal-cert.com/admin/dashboard` already authenticated as the
admin account the LMS already had for them. The same handoff serves
`https://vr.goal-cert.com`.

No passwords are shared, synchronised or replicated. No user records are duplicated.

---

## 1. What the analysis found

Before designing anything, the Laravel project at `D:\laragon\www\goalcert` was
inspected end to end. The design below is shaped by what is actually there.

| Area | Finding |
|---|---|
| Framework | Laravel **8.75**, PHP `^7.3\|^8.0` |
| Auth package | **Custom multi-guard session auth.** Not Breeze, Jetstream, Fortify, Passport or Filament. `laravel/sanctum ^2.11` is installed but unused on the admin path |
| Admin guard | `admin` → `session` driver → `App\Models\Admin` (`config/auth.php:50`) |
| Other guards | `web`, `api`, `admin-api`, `customer`, `teacher`, `student` |
| Login | `Admin\LoginController@authenticate` → `Auth::guard('admin')->attempt(['username','password'])` → `admin.dashboard` |
| Login routes | `routes/web.php:997-1003`, inside `middleware => 'guest:admin'` |
| Protected routes | `routes/admin.php:13` → `prefix admin`, `middleware ['auth:admin','checkstatus']`; the dashboard adds `checkpermission:Dashboard` |
| Roles | `App\Models\Role` — `permissions` JSON column + `is_superadmin` boolean |
| Permission helpers | `isSuperAdmin()`, `adminCan()` in `app/Http/Helpers/Helper.php` |
| `admins` table | `role_id` nullable, `username`, **`email` nullable and NOT unique**, `status` tinyint (`0` = banned) |
| Session | `file` driver, 120 minute lifetime, `same_site => null`, no `SESSION_DOMAIN` |
| Tenancy | `stancl/tenancy`; `routes/admin.php` is registered on every host |
| JWT library | **`firebase/php-jwt ^6.4` already installed** |
| Existing precedent | The LTI 1.3 module already performs exactly this kind of programmatic login (`App\Lti\Services\LtiSessionAuthenticatorService`) |

Two findings changed the design:

**`admins.email` has no unique constraint.** Matching a Hub user to a local admin by
email alone could land someone in another person's account. The resolver therefore
requires an *exactly-one* match and refuses on ambiguity, and once a link is made it
is stored against the Hub's immutable user id — never re-derived from email again.

**A latent redirect loop.** `CheckPermission` redirects an admin lacking a permission
to `admin.dashboard`, which is itself gated by `checkpermission:Dashboard`. A password
login by such an admin already loops today. SSO pre-flights that check and refuses
with a clear message instead of handing the user an infinite redirect.

---

## 2. Architecture

```
  Browser                    Hub (FastAPI)                 GoalCert LMS (Laravel)
     │                            │                                  │
     │ 1. sign in                 │                                  │
     ├───────────────────────────►│  session JWT (12 h, HS256)       │
     │                            │  — stays in the browser,         │
     │                            │    never leaves the Hub origin   │
     │                            │                                  │
     │ 2. click "Open LMS"        │                                  │
     ├───────────────────────────►│                                  │
     │   POST /api/sso/ticket     │                                  │
     │                            │ mint TICKET                      │
     │                            │   iss = hub, aud = goalcert-lms  │
     │◄───────────────────────────┤   sub, jti, iat, exp = +60 s     │
     │   { url, token }           │                                  │
     │                            │                                  │
     │ 3. auto-submit hidden form (POST, token in the body)          │
     ├──────────────────────────────────────────────────────────────►│
     │                            │            verify sig/exp/iss/aud/jti
     │                            │            resolve to an EXISTING admin
     │                            │            Auth::guard('admin')->login()
     │◄──────────────────────────────────────────────────────────────┤
     │   302 → /admin/dashboard   │                                  │
     │                            │                                  │
     │ 4. ordinary Laravel session cookie from here on               │
```

### The ticket is not the Hub session token

The Hub already issues a 12-hour HS256 session JWT at login. That token is
deliberately **not** what gets handed to the LMS. A copy of it is a 12-hour master
key for the Hub API, and putting it in a redirect would leak it into browser history,
`Referer` headers and every proxy log on the path.

The ticket is a separate credential:

| | Hub session token | SSO ticket |
|---|---|---|
| Secret | `JWT_SECRET` | `SSO_SECRET` (different) |
| Lifetime | 12 hours | 60 seconds |
| Audience | none | `goalcert-lms` **or** `goalcert-vr`, never both |
| Reusable | yes | no — `jti` is burned on first use |
| Accepted by | the Hub API | one relying party only |

It authenticates a handoff and nothing else.

### The ticket is POSTed, not put in a URL

`openSsoApp()` submits a hidden form. The ticket never reaches the address bar,
the browser history, a `Referer` header or an access log. `GET ?token=` is still
accepted for plain links and testing — the single-use `jti` and 60-second life are
what make that acceptable rather than the transport.

---

## 3. Why this approach, and not the alternatives

**Shared sessions (one session store across apps).**
Would require Laravel and FastAPI to agree on session serialisation, cookie
encryption and `APP_KEY` — Laravel's session payload is a PHP-serialised,
`APP_KEY`-encrypted blob that FastAPI has no business reading. It also couples the
three apps' deployment: rotate `APP_KEY` and the Hub breaks; one app's session bug
becomes everyone's. And it cannot span `goal-cert.com` and `vr.goal-cert.com` as
separate origins without cookie-domain widening (below). Rejected as tight coupling
across a language boundary.

**Cookie sharing (`SESSION_DOMAIN=.goal-cert.com`).**
Would widen the session cookie to every subdomain, present and future. Any XSS on
any subdomain — a marketing page, a tenant subdomain, a staging host — becomes a
full admin session compromise. It also cannot work at all across different apex
domains, and this app is multi-tenant with per-tenant subdomains and custom domains
(`stancl/tenancy`), so the blast radius is genuinely unbounded. It would also mean
changing `config/session.php` for the whole existing application. Rejected as a
security regression.

**OAuth 2.0 / OIDC (full authorization-code flow).**
The right answer when relying parties are third parties you don't control, or when
you need consent screens, scoped delegated API access, refresh tokens and token
revocation. Here all three apps are first-party and operated by one team; there is
no delegated API access to scope and no consent to collect. Adopting it would mean
running an authorization server, a token endpoint, a discovery document, client
registration and a PKCE flow to solve a problem that is one signed assertion wide.
This design is deliberately the *assertion* half of OIDC — a signed identity token
with `iss`/`aud`/`exp`/`jti`, verified the same way — without the delegation
machinery. If a third-party relying party ever appears, this is a short step from
full OIDC rather than a thing to unpick. **This is the alternative worth revisiting
if requirements change.**

**Laravel Passport.**
Makes the *LMS* an OAuth 2 authorization server. That is backwards: the Hub is the
identity provider. It would add ~10 tables, an OAuth server implementation and a key
pair to an app whose only job here is to *accept* an assertion. Rejected as the wrong
direction and heavy.

**Laravel Sanctum.**
Sanctum is for SPA cookie auth on a shared top-level domain, or for API tokens. It
does not do cross-application single sign-on and has no concept of a foreign issuer.
Its SPA mode has the same cookie-domain problem as cookie sharing. It is installed
in this project but unused on the admin path, and it does not solve this. Rejected as
not applicable.

**What was chosen: a short-lived signed assertion, verified locally.**
The LMS's own `admin` guard, `roles` table, permission middleware and session
lifetime remain the sole authority over what a user can do. The Hub only asserts
*who is knocking*. It needs no new tables (one small link table), no new Composer
package (`firebase/php-jwt` is already a dependency), no change to
`config/session.php`, and no change to any existing login path.

---

## 4. Files

### GoalCert LMS — `D:\laragon\www\goalcert`

**New**

```
config/sso.php                                              configuration
routes/sso.php                                              the SSO route
app/Sso/Exceptions/SsoException.php                         technical vs. public failure messages
app/Sso/Services/HubTokenVerifier.php                       JWT verification
app/Sso/Services/AdminIdentityResolver.php                  claims → existing admin
app/Sso/Http/Controllers/HubSsoController.php               the endpoint
app/Models/AdminSsoIdentity.php                             the link model
database/migrations/2026_08_03_000000_create_admin_sso_identities_table.php
```

**Modified** — four lines of behaviour change in total

| File | Change |
|---|---|
| `routes/web.php` | one line registering `routes/sso.php`, next to `routes/admin.php` |
| `app/Http/Middleware/VerifyCsrfToken.php` | added `sso/hub/callback` to `$except` |
| `app/Http/Controllers/Admin/LoginController.php` | `logout()` returns SSO'd admins to the Hub; password logins behave exactly as before |
| `.env` / `.env.example` | new `HUB_SSO_*` variables |

Nothing else was touched. `config/auth.php`, `app/Http/Kernel.php`, the guards, the
providers, `routes/admin.php`, `App\Models\Admin`, `App\Models\Role` and every
existing middleware are unchanged.

### Hub — `hub/backend`

```
sso.py                        NEW — ticket minting, GET /api/sso/apps, POST /api/sso/ticket
server.py                     +2 lines: import sso, include its router
.env / .env.example           new SSO_* variables
```

### Hub frontend — `hub/web/src`

```
hub/SsoLauncher.jsx           NEW — the "Open LMS" topbar control
api.js                        + API.sso.*  and  openSsoApp()
App.jsx                       + <SsoLauncher /> in the topbar
```

### VR LMS

```
hub/integrations/vr_lms/sso_verifier.py    drop-in relying party (FastAPI)
```

Copy it into the VR LMS, `app.include_router(sso_verifier.router)`, and implement
`establish_session()` — the one function that depends on how that app stores users
and sessions. Everything above it is complete and tested.

---

## 5. Deployment

### 5.1 Generate the SSO secret

```bash
openssl rand -hex 48
```

Set this as `SSO_SECRET` on the Hub and `HUB_SSO_SECRET` on **both** LMS apps.
It must be **at least 32 characters** — both sides refuse to start an SSO handoff
with a shorter one — and it must **not** be the Hub's `JWT_SECRET`.

### 5.2 Hub (`hub/backend/.env`)

```dotenv
SSO_ISSUER=https://hub.goal-cert.com
SSO_ALGORITHM=HS256
SSO_SECRET=<the value from 5.1>
SSO_TICKET_TTL_SECONDS=60

SSO_LMS_AUDIENCE=goalcert-lms
SSO_LMS_CALLBACK_URL=https://goal-cert.com/sso/hub/callback
SSO_LMS_DEFAULT_TARGET=/admin/dashboard
SSO_LMS_ROLES=super_admin,admin

SSO_VR_AUDIENCE=goalcert-vr
SSO_VR_CALLBACK_URL=https://vr.goal-cert.com/sso/hub/callback
SSO_VR_DEFAULT_TARGET=/dashboard
SSO_VR_ROLES=super_admin,admin
```

### 5.3 GoalCert LMS (`.env`)

```dotenv
HUB_SSO_ENABLED=true
HUB_SSO_ISSUER=https://hub.goal-cert.com      # must equal SSO_ISSUER exactly
HUB_SSO_AUDIENCE=goalcert-lms                 # must equal SSO_LMS_AUDIENCE
HUB_SSO_ALGORITHM=HS256
HUB_SSO_SECRET=<the value from 5.1>
HUB_SSO_MAX_AGE_SECONDS=120
HUB_SSO_LEEWAY_SECONDS=30
HUB_SSO_REPLAY_PROTECTION=true
HUB_SSO_ALLOWED_ROLES=super_admin,admin
HUB_SSO_REQUIRE_DASHBOARD_PERMISSION=true
HUB_SSO_MATCH_BY_EMAIL=true
HUB_SSO_MATCH_BY_USERNAME=true
HUB_SSO_AUTO_PROVISION=false
HUB_SSO_LOGOUT_URL=https://hub.goal-cert.com/login
```

`HUB_SSO_ISSUER` is compared byte for byte. A trailing slash on one side and not the
other fails the check.

### 5.4 Migrate

```bash
php artisan migrate
php artisan config:clear
```

**Do not run `php artisan config:cache` or `route:cache` on this app.** The LMS
calls `env()` at runtime in `routes/web.php`, `Authenticate.php`, `Helper.php`
and `Handler.php`; with config cached those return `null` and routing breaks.
Pre-existing, not introduced here — see COMMERCE_INTEGRATION.md §6.4 for the
full list and the verification.

### 5.5 Cache store — required for multi-node

Replay protection burns each `jti` in Laravel's cache. The `file` and `array` drivers
are **per-node**, so on more than one web server a ticket replayed against a different
node would be accepted. Set a shared store:

```dotenv
CACHE_DRIVER=redis
# or, to leave the app cache alone and give SSO its own store:
HUB_SSO_REPLAY_CACHE_STORE=redis
```

Single node is fine on `file`. The same applies to the VR LMS module —
set `HUB_SSO_REDIS_URL` there if it runs more than one worker.

### 5.6 First-run account linking

The first time an admin arrives, the LMS matches them to an existing `admins` row by
email, then by username. Confirm before rollout that each Hub admin's email matches
exactly one row:

```sql
SELECT email, COUNT(*) c FROM admins
WHERE email IS NOT NULL AND email <> ''
GROUP BY email HAVING c > 1;
```

Any row returned is an account that SSO will refuse until the duplicate is resolved —
by design, since guessing would be an account-takeover path. After the first
successful login the pairing is stored in `admin_sso_identities` against the Hub's
user id, and email is never consulted again.

---

## 6. Verification chain

Every check must pass, in this order. The first failure redirects to
`route('admin.login')` with a message in the `alert` flash key that
`admin/login.blade.php` already renders.

| # | Check | Rejects |
|---|---|---|
| 1 | `HUB_SSO_ENABLED` | the whole feature, as a kill switch |
| 2 | Algorithm is in the allow-list | `alg: none`, algorithm confusion |
| 3 | **Signature** under our configured key | forged and tampered tickets |
| 4 | `exp` / `nbf` (± leeway) | expired and not-yet-valid tickets |
| 5 | `iat` age ≤ `HUB_SSO_MAX_AGE_SECONDS` | a misconfigured Hub issuing long-lived tickets |
| 6 | **`iss`** equals `HUB_SSO_ISSUER` | tickets from another issuer |
| 7 | **`aud`** contains `HUB_SSO_AUDIENCE` | a ticket minted for the VR LMS |
| 8 | `jti` present and unused | replay |
| 9 | `sub` present | malformed tickets |
| 10 | **Hub role** in `HUB_SSO_ALLOWED_ROLES` | non-admin Hub personas |
| 11 | **User exists** — link, then email, then username | unknown users; ambiguous matches |
| 12 | Local `status != 0` | deactivated admins |
| 13 | Local role grants `Dashboard` | the redirect loop |
| 14 | Admin not already linked to a different Hub user | account hijack via a shared email |

Only then: `Auth::guard('admin')->login($admin)` + `session()->regenerate()`.

Steps 6, 7 and 8 use `hash_equals` and an atomic `Cache::add`. Failure messages shown
to the visitor are deliberately vague; the precise reason goes to the log with the
source IP.

---

## 7. Security notes

**Authorisation stays local.** The Hub's role is an *input* — it decides whether a
handoff is offered at all. What the admin can then do is decided entirely by the
`roles` row on the local `admins` record, exactly as on the password path. A
compromised Hub cannot grant LMS permissions that the LMS did not already grant.

**No auto-provisioning.** `HUB_SSO_AUTO_PROVISION` is off. An unknown Hub user is
refused, not created. If you ever turn it on, set `HUB_SSO_PROVISION_ROLE_ID` too —
`isSuperAdmin()` in this codebase treats a role-less admin as the legacy owner with
full access, so a provisioned admin with no role would be a super admin.

**No password synchronisation.** Nothing reads or writes `admins.password`. Existing
passwords keep working for anyone who prefers the normal login form.

**Session fixation.** `session()->regenerate()` runs immediately after login, and a
session belonging to a *different* admin is invalidated first.

**Open redirect.** The optional `rt` claim is sanitised when minted and validated
again on arrival against `sso.redirect.allowed_prefixes`. `//host`,
`/\host` and absolute URLs all fall back to the dashboard.

**Rate limiting.** `throttle:30,1` on the callback caps offline signature guessing.

**CSRF.** `sso/hub/callback` is CSRF-exempt because the Hub posts to it cross-site.
Safe here: the endpoint's authority comes entirely from a signed, single-use,
audience-bound ticket — a forged cross-site POST without a valid ticket achieves
nothing, and one *with* a valid ticket is the intended flow.

### Recommended hardening

1. **Move to RS256 in production.** The Hub holds the private key; each LMS holds
   only the public key and therefore *cannot forge tickets it would itself accept*.
   With HS256 the shared secret is a symmetric forging capability in three places.

   ```bash
   openssl genrsa -out hub-sso-private.key 2048
   openssl rsa -in hub-sso-private.key -pubout -out hub-sso-public.key
   ```

   Hub: `SSO_ALGORITHM=RS256`, `SSO_PRIVATE_KEY_PATH=…`
   LMS: `HUB_SSO_ALGORITHM=RS256`, `HUB_SSO_PUBLIC_KEY_PATH=…`

   Both implementations already support this — it is configuration only.

2. **HTTPS everywhere, and set `SESSION_SECURE_COOKIE=true`.** It currently defaults
   to `false` in `config/session.php`.

3. **Set `'same_site' => 'lax'`** in `config/session.php`. It is `null` today;
   `lax` is the safe explicit value and does not break the SSO POST, because the
   redirect that follows is a top-level GET navigation.

4. **Shared cache store** for replay protection on multi-node — see §5.5. This is
   the one item that silently degrades rather than failing loudly.

5. **Rotate `SSO_SECRET`** on the usual schedule. Rotation is a coordinated restart
   of the Hub and both relying parties; tickets live 60 seconds, so the window in
   which in-flight tickets break is negligible.

6. **Monitor the logs.** Refusals log at `warning` with the reason and source IP;
   successes log at `info` with the admin id and Hub subject. A run of
   `[sso] handoff refused` from one IP is worth an alert.

---

## 8. Testing

Verified against the live `goalcert_db` schema and the Hub's real ticket minter.

| Suite | Result |
|---|---|
| SSO verification and identity resolution (42 cases: signature, `alg: none`, tampering, expiry, age ceiling, issuer, audience, replay, roles, ambiguous email, deactivated admin, dashboard permission, open redirect, session, kill switch) | 42 / 42 |
| Regression — existing password login, wrong password, `guest:admin`, logout, dead sessions | 11 / 11 |
| Cross-system — tickets minted by the Hub's `create_sso_ticket()` consumed by Laravel's real endpoint | 10 / 10 |
| VR LMS relying party against real Hub tickets | 11 / 11 |
| Hub frontend build (`npm run build`) | clean |

Manual smoke test:

1. Sign in to the Hub as a `super_admin` or `admin`.
2. Click **Open LMS** in the topbar.
3. A new tab lands on `/admin/dashboard`, signed in, with no credential prompt.
4. Confirm no new row appeared in `admins`, and one row appeared in
   `admin_sso_identities`.
5. Sign in to the LMS with a username and password — unchanged.
