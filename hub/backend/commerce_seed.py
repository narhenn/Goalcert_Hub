"""
commerce_seed.py — import the existing public catalogue into the database, and
bootstrap the payment gateways from the environment.

The pricing page used to read a hardcoded `products.js`. Those are the real
prices, so this imports them rather than inventing any: 6 products become
Modules, their tiers become Plans, and each tier's INR and USD figures become
PlanPrices. After this the storefront is data, and the platform owner edits it
through the admin UI instead of a code deploy.

Idempotent: existing modules and plans are left alone. Run it once, or after
adding new entries to the JSON export.

Usage:  python commerce_seed.py [path/to/prods.json]
"""
from __future__ import annotations

import json
import logging
import os
import pathlib
import sys

from sqlalchemy.orm import Session

from commerce_models import PaymentGateway, Plan, PlanPrice
from db import SessionLocal
from rbac_models import Module

logger = logging.getLogger("hub-backend")

# Where the catalogue was exported from the frontend module.
DEFAULT_EXPORT = pathlib.Path(__file__).resolve().parent / "catalog_export.json"

# Pricing is flat per billing period; the period string follows the cycle.
PERIOD_BY_CYCLE = {"yearly": "/yr", "monthly": "/mo", "one_time": ""}

CATEGORY = {
    "droneforce": "Training", "digitaltwin": "Operations", "lms": "Training",
    "xrlms": "Training", "agentic": "Intelligence", "simengine": "Simulation",
}

# ── Payment gateways ──────────────────────────────────────────────────
#
# Gateways the platform knows how to configure. Adding a fourth is a row, but
# the *integration* for it is code — so this list is honest about what exists.
KNOWN_GATEWAYS = [
    ("stripe", "Stripe", ["USD", "EUR", "GBP", "INR"]),
    ("razorpay", "Razorpay", ["INR"]),
    ("paypal", "PayPal", ["USD", "EUR", "GBP"]),
]

# How a gateway's credentials reach a fresh deploy — a new Render service, a
# new laptop — without ever entering the repo. The field names are exactly the
# keys the admin Payments screen renders, so a value adopted from here shows up
# as "stored" against the right label.
GATEWAY_ENV = {
    "stripe": {
        "publishable_key": "STRIPE_PUBLISHABLE_KEY",
        "secret_key": "STRIPE_SECRET_KEY",
        "webhook_secret": "STRIPE_WEBHOOK_SECRET",
    },
    "razorpay": {
        "key_id": "RAZORPAY_KEY_ID",
        "key_secret": "RAZORPAY_KEY_SECRET",
        "webhook_secret": "RAZORPAY_WEBHOOK_SECRET",
    },
    "paypal": {
        "client_id": "PAYPAL_CLIENT_ID",
        "client_secret": "PAYPAL_CLIENT_SECRET",
    },
}

# Which credential tells us live from test, and the prefix that means test.
# PayPal has no such convention (sandbox is a different API host), so it keeps
# whatever the admin ticked.
TEST_KEY_PREFIX = {
    "stripe": ("secret_key", "sk_test_"),
    "razorpay": ("key_id", "rzp_test_"),
}


def ensure_gateways(db: Session) -> list[str]:
    """
    Guarantee a row per known gateway and adopt any credentials sitting in the
    environment. Returns the codes that gained a credential on this pass.

    The environment is a *bootstrap*, not an override: a field is only filled
    while it is blank. Once a key has been saved — from env or through the
    Payments screen — the admin panel is the source of truth, and a stale env
    var left behind on a server can never quietly replace a rotated secret.

    Caller commits.
    """
    touched: list[str] = []

    for i, (code, name, currencies) in enumerate(KNOWN_GATEWAYS):
        g = db.query(PaymentGateway).filter_by(code=code).first()
        if not g:
            g = PaymentGateway(code=code, name=name, currencies=currencies,
                               sort_order=i * 10)
            db.add(g)
            db.flush()

        cfg = dict(g.config or {})
        was_unconfigured = not any(cfg.values())

        adopted = []
        for field, env_name in GATEWAY_ENV.get(code, {}).items():
            value = (os.getenv(env_name) or "").strip()
            if value and not cfg.get(field):
                cfg[field] = value
                adopted.append(field)

        if not adopted:
            continue

        g.config = cfg
        touched.append(code)

        # A gateway nobody has configured yet turns itself on the moment it has
        # credentials to work with. Only on that first adoption — a gateway an
        # admin deliberately switched off stays off.
        if was_unconfigured:
            g.is_enabled = True
            field, prefix = TEST_KEY_PREFIX.get(code, (None, None))
            if field and cfg.get(field):
                g.is_test_mode = str(cfg[field]).startswith(prefix)

        logger.info("gateway %s: adopted %s from environment", code, ", ".join(adopted))

    return touched


def seed_gateways() -> None:
    """Startup hook: gateways exist and know their keys before the first request."""
    db = SessionLocal()
    try:
        ensure_gateways(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def import_catalog(path: pathlib.Path) -> tuple[int, int]:
    data = json.loads(path.read_text(encoding="utf-8"))
    db = SessionLocal()
    mods = plans = 0
    try:
        for i, (code, p) in enumerate(data.items()):
            mod = db.query(Module).filter_by(code=code).first()
            if not mod:
                mod = Module(
                    code=code,
                    name=p.get("name", code),
                    tagline=p.get("tag", ""),
                    description=p.get("desc", ""),
                    category=CATEGORY.get(code, ""),
                    color=p.get("color", "#6d28d9"),
                    icon="ti-box",
                    status="active", is_active=True, is_public=True,
                    sort_order=(i + 1) * 10,
                )
                db.add(mod)
                db.flush()
                mods += 1

            for j, t in enumerate(p.get("tiers", [])):
                tier_code = "".join(ch.lower() if ch.isalnum() else "-"
                                    for ch in t["name"]).strip("-")
                if db.query(Plan).filter_by(module_id=mod.id, code=tier_code).first():
                    continue

                cycle = "monthly" if p.get("perMonth") else "yearly"
                plan = Plan(
                    module_id=mod.id, code=tier_code, name=t["name"],
                    description=t.get("scope", ""),
                    features=t.get("feats", []), excluded=t.get("notincl", []),
                    scope=t.get("scope", ""),
                    action=t.get("action", "signup"),
                    is_popular=bool(t.get("popular")),
                    billing_cycle=cycle,
                    is_active=True, sort_order=j * 10,
                )
                db.add(plan)
                db.flush()

                # Flat per period — the catalogue's per-seat periods are ignored.
                period = PERIOD_BY_CYCLE[cycle]
                if t.get("price") is not None:
                    db.add(PlanPrice(plan_id=plan.id, country_code="IN", currency="INR",
                                     amount=t["price"], period=period, is_default=True))
                if t.get("usd") is not None:
                    db.add(PlanPrice(plan_id=plan.id, country_code="US", currency="USD",
                                     amount=t["usd"], period=period, is_default=False))
                plans += 1

        db.commit()
        return mods, plans
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    src = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_EXPORT
    if not src.exists():
        print(f"No catalogue export at {src}.\n"
              f"Produce one from hub/web/src/public with:\n"
              f"  node --input-type=module -e \"import {{PRODS}} from './products.js';"
              f" process.stdout.write(JSON.stringify(PRODS))\" > {src}")
        raise SystemExit(1)
    m, p = import_catalog(src)
    print(f"Imported {m} microservice(s) and {p} plan(s) from {src.name}.")
