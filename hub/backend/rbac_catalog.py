"""
rbac_catalog.py — the SHIPPED catalogue: what the platform provides out of the box.

This is seed *data*, not runtime logic. Nothing here is consulted to decide an
authorisation — every check reads the database. This file only answers "what
should exist in a brand-new install", the same way Salesforce ships standard
profiles or ServiceNow ships baseline roles. A tenant can rename these, re-map
their permissions, or ignore them entirely, and the platform never notices.

Editing this file changes what a FRESH install gets. To change a running system,
change the rows (or use the admin API) — the seed is idempotent and will not
overwrite an existing role's permissions.
"""
from __future__ import annotations

from rbac_models import LEVEL_COMPANY, LEVEL_PLATFORM

# ══ Permission groups ══════════════════════════════════════════════════
# (code, name, level, sort)
GROUPS = [
    ("platform.tenancy",   "Companies & Tenancy",     LEVEL_PLATFORM, 10),
    ("platform.catalog",   "Microservices & Packages", LEVEL_PLATFORM, 20),
    ("platform.infra",     "Infrastructure & Integrations", LEVEL_PLATFORM, 30),
    ("platform.commerce",  "Billing & Payments",      LEVEL_PLATFORM, 40),
    ("platform.governance", "Security & Governance",  LEVEL_PLATFORM, 50),
    ("company.profile",    "Company Profile",         LEVEL_COMPANY, 110),
    ("company.people",     "Users & Teams",           LEVEL_COMPANY, 120),
    ("company.access",     "Roles & Access",          LEVEL_COMPANY, 130),
    ("company.billing",    "Subscription & Billing",  LEVEL_COMPANY, 140),
    ("company.operations", "Operations",              LEVEL_COMPANY, 150),
    ("company.training",   "Training & Certification", LEVEL_COMPANY, 160),
    ("company.quality",    "Quality & Compliance",    LEVEL_COMPANY, 170),
    ("company.maintenance", "Maintenance",            LEVEL_COMPANY, 180),
    ("company.safety",     "Safety & EHS",            LEVEL_COMPANY, 190),
    ("company.it",         "IT & Integrations",       LEVEL_COMPANY, 200),
    ("company.insight",    "Dashboards & Reports",    LEVEL_COMPANY, 210),
]

# ══ Permissions ════════════════════════════════════════════════════════
# (code, name, group, level). Code is `<scope>.<resource>.<action>` and is the
# ONLY thing code ever asserts on.
PERMISSIONS = [
    # ── Platform owner ────────────────────────────────────────────────
    ("platform.companies.view",    "View all companies",        "platform.tenancy", LEVEL_PLATFORM),
    ("platform.companies.create",  "Create companies",          "platform.tenancy", LEVEL_PLATFORM),
    ("platform.companies.update",  "Update any company",        "platform.tenancy", LEVEL_PLATFORM),
    ("platform.companies.suspend", "Suspend companies",         "platform.tenancy", LEVEL_PLATFORM),
    ("platform.companies.delete",  "Delete companies",          "platform.tenancy", LEVEL_PLATFORM),
    ("platform.tenants.impersonate", "View any tenant's data",  "platform.tenancy", LEVEL_PLATFORM),

    ("platform.modules.view",      "View microservices",        "platform.catalog", LEVEL_PLATFORM),
    ("platform.modules.manage",    "Create & configure microservices", "platform.catalog", LEVEL_PLATFORM),
    ("platform.plans.view",        "View subscription plans",   "platform.catalog", LEVEL_PLATFORM),
    ("platform.plans.manage",      "Manage subscription plans", "platform.catalog", LEVEL_PLATFORM),
    ("platform.pricing.manage",    "Manage country pricing",    "platform.catalog", LEVEL_PLATFORM),
    ("platform.features.manage",   "Manage feature flags",      "platform.catalog", LEVEL_PLATFORM),

    ("platform.smtp.manage",       "Configure global SMTP",     "platform.infra", LEVEL_PLATFORM),
    ("platform.storage.manage",    "Configure storage providers", "platform.infra", LEVEL_PLATFORM),
    ("platform.branding.manage",   "Global branding",           "platform.infra", LEVEL_PLATFORM),
    ("platform.settings.manage",   "Global settings",           "platform.infra", LEVEL_PLATFORM),
    ("platform.notifications.manage", "Global notifications",   "platform.infra", LEVEL_PLATFORM),
    ("platform.webhooks.manage",   "Manage webhooks",           "platform.infra", LEVEL_PLATFORM),
    ("platform.apikeys.manage",    "Manage platform API keys",  "platform.infra", LEVEL_PLATFORM),
    ("platform.backup.manage",     "Backup settings",           "platform.infra", LEVEL_PLATFORM),

    ("platform.payments.manage",   "Configure payment gateways", "platform.commerce", LEVEL_PLATFORM),
    ("platform.transactions.view", "View all transactions",     "platform.commerce", LEVEL_PLATFORM),

    ("platform.roles.manage",      "Create & manage global roles", "platform.governance", LEVEL_PLATFORM),
    ("platform.permissions.manage", "Manage the permission catalogue", "platform.governance", LEVEL_PLATFORM),
    ("platform.menus.manage",      "Manage the sidebar",        "platform.governance", LEVEL_PLATFORM),
    ("platform.dashboards.manage", "Manage dashboard widgets",  "platform.governance", LEVEL_PLATFORM),
    ("platform.audit.view",        "Platform audit logs",       "platform.governance", LEVEL_PLATFORM),
    ("platform.analytics.view",    "Platform analytics",        "platform.governance", LEVEL_PLATFORM),
    ("platform.reports.view",      "Platform reports",          "platform.governance", LEVEL_PLATFORM),
    ("platform.security.manage",   "Platform security",         "platform.governance", LEVEL_PLATFORM),

    # ── Company: profile ──────────────────────────────────────────────
    ("company.profile.view",       "View company profile",      "company.profile", LEVEL_COMPANY),
    ("company.profile.update",     "Edit company profile",      "company.profile", LEVEL_COMPANY),
    ("company.branding.manage",    "Company branding",          "company.profile", LEVEL_COMPANY),
    ("company.smtp.manage",        "Company SMTP",              "company.profile", LEVEL_COMPANY),

    # ── Company: people ───────────────────────────────────────────────
    ("company.users.view",         "View users",                "company.people", LEVEL_COMPANY),
    ("company.users.create",       "Create users",              "company.people", LEVEL_COMPANY),
    ("company.users.update",       "Edit users",                "company.people", LEVEL_COMPANY),
    ("company.users.delete",       "Delete users",              "company.people", LEVEL_COMPANY),
    ("company.users.suspend",      "Suspend & activate users",  "company.people", LEVEL_COMPANY),
    ("company.users.reset_password", "Reset passwords",         "company.people", LEVEL_COMPANY),
    ("company.teams.view",         "View teams",                "company.people", LEVEL_COMPANY),
    ("company.teams.manage",       "Manage teams",              "company.people", LEVEL_COMPANY),
    ("company.employees.manage",   "Manage employees & onboarding", "company.people", LEVEL_COMPANY),
    ("company.attendance.manage",  "Manage attendance",         "company.people", LEVEL_COMPANY),

    # ── Company: access ───────────────────────────────────────────────
    ("company.roles.view",         "View roles",                "company.access", LEVEL_COMPANY),
    ("company.roles.manage",       "Create & edit roles",       "company.access", LEVEL_COMPANY),
    ("company.roles.assign",       "Assign roles to users",     "company.access", LEVEL_COMPANY),
    ("company.modules.assign",     "Assign purchased microservices", "company.access", LEVEL_COMPANY),

    # ── Company: billing ──────────────────────────────────────────────
    ("company.subscription.view",  "View subscription",         "company.billing", LEVEL_COMPANY),
    ("company.subscription.manage", "Purchase & renew packages", "company.billing", LEVEL_COMPANY),
    ("company.invoices.view",      "View invoices",             "company.billing", LEVEL_COMPANY),
    ("company.transactions.view",  "View transactions",         "company.billing", LEVEL_COMPANY),
    ("company.payments.manage",    "Manage payments & refunds", "company.billing", LEVEL_COMPANY),
    ("company.taxes.manage",       "Manage taxes",              "company.billing", LEVEL_COMPANY),

    # ── Company: operations ───────────────────────────────────────────
    ("company.plant.view",         "Plant dashboard",           "company.operations", LEVEL_COMPANY),
    ("company.kpi.view",           "View KPIs",                 "company.operations", LEVEL_COMPANY),
    ("company.production.view",    "Production reports",        "company.operations", LEVEL_COMPANY),
    ("company.approvals.manage",   "Approvals",                 "company.operations", LEVEL_COMPANY),
    ("company.shifts.manage",      "Shift planning",            "company.operations", LEVEL_COMPANY),
    ("company.tasks.assign",       "Assign tasks",              "company.operations", LEVEL_COMPANY),
    ("company.line.monitor",       "Monitor production lines",  "company.operations", LEVEL_COMPANY),
    ("company.operators.manage",   "Manage operators",          "company.operations", LEVEL_COMPANY),
    ("company.twin.view",          "View live twins",           "company.operations", LEVEL_COMPANY),
    ("company.twin.manage",        "Build & manage twins",      "company.operations", LEVEL_COMPANY),

    # ── Company: training ─────────────────────────────────────────────
    ("company.training.view",      "View training",             "company.training", LEVEL_COMPANY),
    ("company.training.manage",    "Manage training & learning paths", "company.training", LEVEL_COMPANY),
    ("company.courses.assign",     "Assign courses",            "company.training", LEVEL_COMPANY),
    ("company.assessments.manage", "Manage assessments",        "company.training", LEVEL_COMPANY),
    ("company.assessments.take",   "Take assessments",          "company.training", LEVEL_COMPANY),
    ("company.certifications.view", "View certifications",      "company.training", LEVEL_COMPANY),
    ("company.certifications.manage", "Manage certifications",  "company.training", LEVEL_COMPANY),
    ("company.simulations.run",    "Run assigned simulations",  "company.training", LEVEL_COMPANY),
    ("company.simulations.author", "Author simulations",        "company.training", LEVEL_COMPANY),
    ("company.sop.view",           "View SOPs & work instructions", "company.training", LEVEL_COMPANY),
    ("company.sop.manage",         "Manage SOPs",               "company.training", LEVEL_COMPANY),
    ("company.work.submit",        "Submit work",               "company.training", LEVEL_COMPANY),

    # ── Company: quality & compliance ─────────────────────────────────
    ("company.compliance.view",    "Compliance dashboard",      "company.quality", LEVEL_COMPANY),
    ("company.compliance.manage",  "Manage compliance evidence", "company.quality", LEVEL_COMPANY),
    ("company.audit.view",         "Company audit records",     "company.quality", LEVEL_COMPANY),
    ("company.documents.manage",   "Regulatory documents",      "company.quality", LEVEL_COMPANY),
    ("company.incidents.view",     "View incident reports",     "company.quality", LEVEL_COMPANY),
    ("company.incidents.manage",   "Manage incident reports",   "company.quality", LEVEL_COMPANY),
    ("company.capa.manage",        "Manage CAPA",               "company.quality", LEVEL_COMPANY),
    ("company.quality.inspect",    "Quality checks & inspections", "company.quality", LEVEL_COMPANY),
    ("company.ncr.manage",         "Manage NCRs",               "company.quality", LEVEL_COMPANY),

    # ── Company: maintenance ──────────────────────────────────────────
    ("company.equipment.view",     "View equipment",            "company.maintenance", LEVEL_COMPANY),
    ("company.equipment.manage",   "Manage equipment",          "company.maintenance", LEVEL_COMPANY),
    ("company.maintenance.preventive", "Preventive maintenance", "company.maintenance", LEVEL_COMPANY),
    ("company.maintenance.corrective", "Corrective maintenance", "company.maintenance", LEVEL_COMPANY),
    ("company.workorders.manage",  "Manage work orders",        "company.maintenance", LEVEL_COMPANY),

    # ── Company: safety ───────────────────────────────────────────────
    ("company.ehs.manage",         "Manage EHS",                "company.safety", LEVEL_COMPANY),
    ("company.risk.assess",        "Risk assessment",           "company.safety", LEVEL_COMPANY),
    ("company.safety.audit",       "Safety audits",             "company.safety", LEVEL_COMPANY),
    ("company.ppe.manage",         "PPE management",            "company.safety", LEVEL_COMPANY),
    ("company.drills.manage",      "Emergency drills",          "company.safety", LEVEL_COMPANY),

    # ── Company: IT ───────────────────────────────────────────────────
    ("company.sso.manage",         "Manage SSO",                "company.it", LEVEL_COMPANY),
    ("company.apikeys.manage",     "Manage company API keys",   "company.it", LEVEL_COMPANY),
    ("company.devices.manage",     "Device management",         "company.it", LEVEL_COMPANY),
    ("company.integrations.manage", "Manage integrations",      "company.it", LEVEL_COMPANY),
    ("company.security.manage",    "Company security",          "company.it", LEVEL_COMPANY),
    ("company.storage.manage",     "Company storage",           "company.it", LEVEL_COMPANY),

    # ── Company: insight ──────────────────────────────────────────────
    ("company.dashboard.view",     "View company dashboard",    "company.insight", LEVEL_COMPANY),
    ("company.reports.view",       "View company reports",      "company.insight", LEVEL_COMPANY),
    ("company.notifications.manage", "Company notifications",   "company.insight", LEVEL_COMPANY),
    ("company.agents.use",         "Use AI agents",             "company.insight", LEVEL_COMPANY),
    ("company.agents.build",       "Build AI agents",           "company.insight", LEVEL_COMPANY),
]

# Every read-only permission, derived rather than listed: the Viewer role is
# "everything that only looks". Keeping it derived means a new .view permission
# is automatically available to auditors without editing a role definition.
VIEW_ACTIONS = {"view", "monitor"}


def _is_view(code: str) -> bool:
    return code.rsplit(".", 1)[-1] in VIEW_ACTIONS


# ══ Roles ══════════════════════════════════════════════════════════════
# (code, name, level, icon, colour, sort, description, [permission codes])
# "*" means every permission at that level.

PLATFORM_ROLES = [
    {
        "code": "platform_owner", "name": "Platform Owner", "icon": "ti-crown",
        "color": "#b45309", "sort": 0, "is_system": True,
        "description": "The SaaS operator. Belongs to no company and administers the whole platform.",
        "permissions": "*",
    },
    {
        "code": "platform_support", "name": "Platform Support", "icon": "ti-lifebuoy",
        "color": "#0891b2", "sort": 10, "is_system": True,
        "description": "Reads any tenant to troubleshoot, changes no configuration.",
        "permissions": [
            "platform.companies.view", "platform.tenants.impersonate",
            "platform.modules.view", "platform.plans.view",
            "platform.audit.view", "platform.analytics.view", "platform.reports.view",
        ],
    },
]

COMPANY_ROLES = [
    {
        "code": "company_admin", "name": "Company Admin", "icon": "ti-settings",
        "color": "#64748b", "sort": 0, "is_system": True, "is_default": False,
        "description": "Manages the entire company: people, roles, subscription and settings.",
        "permissions": "*",   # every company-level permission, never a platform one
    },
    {
        "code": "coo", "name": "Plant Manager / COO", "icon": "ti-chart-line",
        "color": "#2563eb", "sort": 10,
        "description": "Runs the plant: dashboards, KPIs, production performance and approvals.",
        "permissions": [
            "company.dashboard.view", "company.plant.view", "company.kpi.view",
            "company.production.view", "company.reports.view", "company.approvals.manage",
            "company.users.view", "company.teams.view", "company.line.monitor",
            "company.twin.view", "company.compliance.view", "company.agents.use",
            "company.certifications.view", "company.incidents.view",
        ],
    },
    {
        "code": "supervisor", "name": "Line Supervisor", "icon": "ti-users",
        "color": "#0891b2", "sort": 20,
        "description": "Runs the shift: operators, task assignment and line monitoring.",
        "permissions": [
            "company.dashboard.view", "company.operators.manage", "company.shifts.manage",
            "company.tasks.assign", "company.line.monitor", "company.reports.view",
            "company.twin.view", "company.users.view", "company.training.view",
            "company.certifications.view", "company.courses.assign", "company.agents.use",
        ],
    },
    {
        "code": "frontline", "name": "Frontline Operator", "icon": "ti-tool",
        "color": "#7c3aed", "sort": 30, "is_default": True,
        "description": "Does the work: assigned simulations, training, SOPs and submissions.",
        "permissions": [
            "company.dashboard.view", "company.simulations.run", "company.training.view",
            "company.sop.view", "company.assessments.take", "company.certifications.view",
            "company.work.submit", "company.twin.view", "company.agents.use",
        ],
    },
    {
        "code": "lnd", "name": "L&D / Trainer", "icon": "ti-school",
        "color": "#D07C1E", "sort": 40,
        "description": "Owns learning: paths, courses, assessments and certification.",
        "permissions": [
            "company.dashboard.view", "company.training.view", "company.training.manage",
            "company.courses.assign", "company.assessments.manage",
            "company.certifications.view", "company.certifications.manage",
            "company.simulations.author", "company.simulations.run",
            "company.sop.view", "company.sop.manage", "company.reports.view",
            "company.users.view", "company.agents.use", "company.agents.build",
        ],
    },
    {
        "code": "compliance", "name": "Compliance Officer", "icon": "ti-shield-check",
        "color": "#16a34a", "sort": 50,
        "description": "Holds the evidence chain: audit records, regulatory documents, CAPA.",
        "permissions": [
            "company.dashboard.view", "company.compliance.view", "company.compliance.manage",
            "company.audit.view", "company.documents.manage", "company.incidents.view",
            "company.incidents.manage", "company.capa.manage", "company.reports.view",
            "company.certifications.view", "company.users.view",
        ],
    },
    {
        "code": "maintenance", "name": "Maintenance Engineer", "icon": "ti-wrench",
        "color": "#ea580c", "sort": 60,
        "description": "Keeps equipment running: PM, CM and work orders.",
        "permissions": [
            "company.dashboard.view", "company.equipment.view", "company.equipment.manage",
            "company.maintenance.preventive", "company.maintenance.corrective",
            "company.workorders.manage", "company.reports.view", "company.twin.view",
            "company.incidents.view", "company.agents.use",
        ],
    },
    {
        "code": "quality", "name": "Quality Engineer", "icon": "ti-checkbox",
        "color": "#0d9488", "sort": 70,
        "description": "Owns product quality: inspections, NCRs and CAPA.",
        "permissions": [
            "company.dashboard.view", "company.quality.inspect", "company.ncr.manage",
            "company.capa.manage", "company.reports.view", "company.documents.manage",
            "company.incidents.view", "company.production.view", "company.agents.use",
        ],
    },
    {
        "code": "safety", "name": "Safety Officer", "icon": "ti-alert-triangle",
        "color": "#dc2626", "sort": 80,
        "description": "Owns EHS: incidents, risk, audits, PPE and drills.",
        "permissions": [
            "company.dashboard.view", "company.ehs.manage", "company.incidents.view",
            "company.incidents.manage", "company.risk.assess", "company.safety.audit",
            "company.ppe.manage", "company.drills.manage", "company.reports.view",
            "company.certifications.view",
        ],
    },
    {
        "code": "hr", "name": "HR / Training Coordinator", "icon": "ti-id-badge",
        "color": "#c026d3", "sort": 90,
        "description": "Owns the people record: onboarding, attendance and training assignment.",
        "permissions": [
            "company.dashboard.view", "company.employees.manage", "company.attendance.manage",
            "company.users.view", "company.users.create", "company.users.update",
            "company.courses.assign", "company.training.view",
            "company.certifications.view", "company.reports.view", "company.teams.view",
        ],
    },
    {
        "code": "finance", "name": "Finance Manager", "icon": "ti-cash",
        "color": "#059669", "sort": 100,
        "description": "Owns the money: invoices, payments, refunds, taxes and billing.",
        "permissions": [
            "company.dashboard.view", "company.invoices.view", "company.transactions.view",
            "company.payments.manage", "company.taxes.manage",
            "company.subscription.view", "company.subscription.manage",
            "company.reports.view",
        ],
    },
    {
        "code": "it_admin", "name": "IT Administrator", "icon": "ti-server-cog",
        "color": "#475569", "sort": 110,
        "description": "Owns the company's technical surface: SSO, API keys, devices, integrations.",
        "permissions": [
            "company.dashboard.view", "company.users.view", "company.users.create",
            "company.users.update", "company.users.suspend", "company.users.reset_password",
            "company.sso.manage", "company.apikeys.manage", "company.devices.manage",
            "company.integrations.manage", "company.security.manage", "company.storage.manage",
            "company.audit.view", "company.roles.view",
        ],
    },
    {
        "code": "viewer", "name": "Viewer / Auditor", "icon": "ti-eye",
        "color": "#78716c", "sort": 120, "is_readonly": True,
        "description": "Read-only across the company. Cannot change anything, anywhere.",
        "permissions": "VIEW_ONLY",   # expanded from the catalogue at seed time
    },
]

# ══ Sidebar ════════════════════════════════════════════════════════════
# (code, label, icon, route, parent, section, module, sort, [permissions])
# A child with no permissions inherits visibility from its parent's grants.
MENUS = [
    # ── Platform console ──────────────────────────────────────────────
    # Points at the database-driven dashboard, not the old hardcoded console —
    # so adding a platform widget is a row in dashboard_widgets.
    ("plat.overview", "Platform Overview", "ti-crown", "overview", None, "Platform", None, 10,
     ["platform.analytics.view"]),
    ("plat.users", "User Management", "ti-users-group", "users", None, "Platform", None, 25,
     ["platform.companies.view"]),
    ("plat.modules", "Microservices", "ti-box", "modules", None, "Platform", None, 30,
     ["platform.modules.view"]),
    ("plat.plans", "Plans & Pricing", "ti-receipt", "plans", None, "Platform", None, 40,
     ["platform.plans.view"]),
    ("plat.access", "Access Control", "ti-lock", None, None, "Platform", None, 50,
     ["platform.roles.manage", "platform.permissions.manage"]),
    ("plat.roles", "Roles", "ti-shield-lock", "roles", "plat.access", "Platform", None, 51,
     ["platform.roles.manage"]),
    ("plat.permissions", "Permissions", "ti-key", "permissions", "plat.access", "Platform", None, 52,
     ["platform.permissions.manage"]),
    ("plat.menus", "Sidebar Builder", "ti-menu-2", "menus", "plat.access", "Platform", None, 53,
     ["platform.menus.manage"]),
    ("plat.settings", "Platform Settings", "ti-settings", None, None, "Platform", None, 60,
     ["platform.settings.manage"]),
    ("plat.smtp", "SMTP", "ti-mail", "smtp", "plat.settings", "Platform", None, 61,
     ["platform.smtp.manage"]),
    ("plat.storage", "Storage", "ti-database", "storage", "plat.settings", "Platform", None, 62,
     ["platform.storage.manage"]),
    ("plat.payments", "Payments", "ti-credit-card", "payments", None, "Platform", None, 64,
     ["platform.payments.manage", "platform.transactions.view"]),
    ("plat.enquiries", "Enquiries", "ti-inbox", "enquiries", None, "Platform", None, 65,
     ["platform.companies.view"]),
    ("plat.audit", "Platform Audit", "ti-history", "audit", None, "Platform", None, 70,
     ["platform.audit.view"]),

    # ── Company workspace ─────────────────────────────────────────────
    ("co.dashboard", "Dashboard", "ti-layout-dashboard", "overview", None, "Workspace", None, 110,
     ["company.dashboard.view"]),
    ("co.shift", "My Shift", "ti-clipboard-check", "assigned", None, "Workspace", None, 120,
     ["company.work.submit", "company.simulations.run"]),
    ("co.team", "Team Readiness", "ti-users", "supervisor", None, "Workspace", None, 130,
     ["company.operators.manage", "company.shifts.manage"]),
    ("co.ops", "Ops Readiness", "ti-gauge", "ops", None, "Workspace", None, 140,
     ["company.plant.view", "company.kpi.view"]),
    # Every microservice, owned or locked. No permission mapping: any member of
    # a tenant may see what the platform offers — buying is what's gated.
    ("co.marketplace", "Microservices", "ti-apps", "marketplace", None, "Workspace", None, 150, []),

    ("co.twin", "Digital Twin", "ti-cube", None, None, "Operations", "twin", 210, []),
    ("co.twins", "Twins", "ti-stack-2", "twins", "co.twin", "Operations", "twin", 211,
     ["company.twin.view"]),
    ("co.live", "Live Dashboard", "ti-activity-heartbeat", "dashboard", "co.twin", "Operations", "twin", 212,
     ["company.twin.view"]),
    ("co.build", "Build a Twin", "ti-sparkles", "build", "co.twin", "Operations", "twin", 213,
     ["company.twin.manage"]),

    ("co.sim", "Simulation", "ti-urgent", None, None, "Operations", "scenario", 220, []),
    ("co.scenario", "Scenario & Faults", "ti-urgent", "scenario", "co.sim", "Operations", "scenario", 221,
     ["company.simulations.run", "company.simulations.author"]),
    ("co.train", "Train with AI", "ti-school", "train", "co.sim", "Operations", "scenario", 222,
     ["company.training.view"]),
    ("co.studio", "Content Studio", "ti-wand", "studio", "co.sim", "Operations", "scenario", 223,
     ["company.training.manage", "company.sop.manage"]),

    ("co.ai", "Intelligence", "ti-robot", None, None, "Operations", None, 230, []),
    ("co.hive", "AUTOMIND Hive", "ti-hexagon", "hivemind", "co.ai", "Operations", "hivemind", 231,
     ["company.agents.use"]),
    ("co.builder", "Agent Builder", "ti-cpu", "builder", "co.ai", "Operations", "agentbuilder", 232,
     ["company.agents.build"]),
    ("co.teamchat", "Team Chat", "ti-messages", "teamchat", "co.ai", "Operations", "agentbuilder", 233,
     ["company.agents.use"]),

    ("co.maintenance", "Maintenance", "ti-wrench", "maintenance", None, "Quality & Safety", None, 310,
     ["company.workorders.manage", "company.equipment.view"]),
    ("co.quality", "Quality", "ti-checkbox", "quality", None, "Quality & Safety", None, 320,
     ["company.quality.inspect", "company.ncr.manage"]),
    ("co.safety", "Safety & EHS", "ti-alert-triangle", "safety", None, "Quality & Safety", None, 330,
     ["company.ehs.manage", "company.risk.assess"]),
    ("co.compliance", "Compliance", "ti-shield-check", "compliance", None, "Quality & Safety", None, 340,
     ["company.compliance.view"]),

    ("co.admin", "Administration", "ti-settings", None, None, "Administration", None, 410, []),
    ("co.company", "Company Profile", "ti-building-store", "admin", "co.admin", "Administration", None, 411,
     ["company.profile.view"]),
    ("co.users", "User Management", "ti-users-group", "users", "co.admin", "Administration", None, 412,
     ["company.users.view"]),
    ("co.roles", "Roles & Access", "ti-shield-lock", "roles", "co.admin", "Administration", None, 413,
     ["company.roles.view"]),
    ("co.billing", "Subscription", "ti-receipt", "billing", "co.admin", "Administration", None, 414,
     ["company.subscription.view"]),
    ("co.invoices", "Invoices", "ti-file-invoice", "invoices", "co.admin", "Administration", None, 415,
     ["company.invoices.view"]),
    ("co.audit", "Audit Trail", "ti-history", "audit", "co.admin", "Administration", None, 416,
     ["company.audit.view"]),
    ("co.loop", "The Loop", "ti-refresh", "loop", None, "Administration", None, 420, []),
]

# Menus that once shipped and have since been withdrawn. Dropping an entry from
# MENUS is not enough on its own: the seed never overwrites, so every database
# that already ran it keeps the row and goes on rendering the item. Listing the
# code here deletes it wherever it still exists, so a withdrawal reaches Render
# and every laptop instead of only the machine it was decided on.
#
# Keep the codes here permanently — a re-seeded database must not resurrect them.
RETIRED_MENUS = [
    "plat.companies",   # tenants are managed from User Management; withdrawn 2026-08-06
]

# ══ Dashboard widgets ══════════════════════════════════════════════════
# (code, title, subtitle, component, level, size, icon, colour, sort,
#  [permission codes], [role codes])
WIDGETS = [
    # Counters read a named metric from /api/platform/stats — the component is
    # generic, `config.metric` says which number it shows. A new counter is a
    # row, not a component.
    ("w.plat.tenants", "Companies", "Tenants on the platform", "PlatformStat",
     LEVEL_PLATFORM, "sm", "ti-building", "#b45309", 10, ["platform.companies.view"], [],
     {"metric": "organizations"}),
    ("w.plat.users", "Platform Users", "Across every tenant", "PlatformStat",
     LEVEL_PLATFORM, "sm", "ti-users", "#2563eb", 20, ["platform.companies.view"], [],
     {"metric": "users"}),
    ("w.plat.subs", "Active Subscriptions", "Services sold and live", "PlatformStat",
     LEVEL_PLATFORM, "sm", "ti-refresh", "#0d9488", 22, ["platform.plans.view"], [],
     {"metric": "subscriptions"}),
    ("w.plat.enquiries", "New Enquiries", "Awaiting a first response", "PlatformStat",
     LEVEL_PLATFORM, "sm", "ti-inbox", "#7c3aed", 24, ["platform.companies.view"], [],
     {"metric": "enquiriesNew", "link": "enquiries"}),
    ("w.plat.earnings", "Earnings", "Paid to date, and this month", "EarningsTile",
     LEVEL_PLATFORM, "lg", "ti-cash", "#16a34a", 26, ["platform.analytics.view"], [], {}),
    ("w.plat.services", "Service Health", "Every microservice, live", "ServiceHealth",
     LEVEL_PLATFORM, "lg", "ti-heartbeat", "#16a34a", 30, ["platform.modules.view"], [], {}),
    ("w.plat.audit", "Recent Platform Activity", "Newest audit entries", "AuditFeed",
     LEVEL_PLATFORM, "full", "ti-history", "#6d28d9", 40, ["platform.audit.view"], [], {}),

    ("w.co.readiness", "Operational Readiness", "One number to run on", "ReadinessGauge",
     LEVEL_COMPANY, "md", "ti-gauge", "#2563eb", 110, ["company.plant.view", "company.kpi.view"], [], {}),
    ("w.co.kpi", "Production KPIs", "Output, quality, uptime", "KpiStrip",
     LEVEL_COMPANY, "lg", "ti-chart-bar", "#0d9488", 120, ["company.kpi.view"], [], {}),
    ("w.co.team", "Team Readiness", "Certification by team", "TeamHeatmap",
     LEVEL_COMPANY, "lg", "ti-users", "#0891b2", 130, ["company.operators.manage"], [], {}),
    ("w.co.myshift", "Assigned to Me", "Today's work", "MyShift",
     LEVEL_COMPANY, "md", "ti-clipboard-check", "#7c3aed", 140, ["company.work.submit"], [], {}),
    ("w.co.training", "Training Progress", "Courses and assessments", "TrainingProgress",
     LEVEL_COMPANY, "md", "ti-school", "#D07C1E", 150, ["company.training.view"], [], {}),
    ("w.co.compliance", "Compliance Posture", "Evidence and gaps", "ComplianceTile",
     LEVEL_COMPANY, "md", "ti-shield-check", "#16a34a", 160, ["company.compliance.view"], [], {}),
    ("w.co.workorders", "Open Work Orders", "By priority", "WorkOrderList",
     LEVEL_COMPANY, "md", "ti-wrench", "#ea580c", 170, ["company.workorders.manage"], [], {}),
    ("w.co.incidents", "Incidents & Risk", "Last 30 days", "IncidentTile",
     LEVEL_COMPANY, "md", "ti-alert-triangle", "#dc2626", 180, ["company.incidents.view"], [], {}),
    ("w.co.billing", "Subscription", "Plan, seats and renewal", "BillingTile",
     LEVEL_COMPANY, "md", "ti-receipt", "#059669", 190, ["company.subscription.view"], [], {}),
    ("w.co.users", "People", "Users by role", "UserBreakdown",
     LEVEL_COMPANY, "md", "ti-users-group", "#64748b", 200, ["company.users.view"], [], {}),
    ("w.co.audit", "Recent Activity", "Company audit trail", "AuditFeed",
     LEVEL_COMPANY, "full", "ti-history", "#6d28d9", 210, ["company.audit.view"], [], {}),
]

# ══ Microservice registry ══════════════════════════════════════════════
# Mirrors what gateway.py currently hardcodes, so the registry is the source of
# truth going forward. (code, name, category, icon, colour, sort, description)
MODULES = [
    ("twin", "Digital Twin", "Operations", "ti-cube", "#0E9E97", 10,
     "Live, physics-grounded model of the asset."),
    ("scenario", "Scenario Engine", "Simulation", "ti-adjustments-bolt", "#D07C1E", 20,
     "Author, run and score what-ifs and training."),
    ("agentic", "Agentic AI", "Intelligence", "ti-robot", "#7A5CF0", 30,
     "The reasoning layer that assists across the platform."),
    ("hivemind", "AUTOMIND Hive", "Intelligence", "ti-hexagon", "#7A5CF0", 40,
     "Specialist agents coordinating on one brief."),
    ("agentbuilder", "Agent Builder", "Intelligence", "ti-cpu", "#00D4FF", 50,
     "Create, configure, test and deploy custom agents."),
    ("frontline", "Frontline Ops", "Operations", "ti-clipboard-check", "#7c3aed", 60,
     "Guided shift flow for operators."),
    ("supervisor", "Supervisor", "Operations", "ti-users", "#0891b2", 70,
     "Team readiness and shift oversight."),
]
