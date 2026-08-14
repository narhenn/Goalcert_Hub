// Plans.jsx — manage microservice pricing tiers and country-specific price variants.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

const ACTIONS = [
  { value: 'signup', label: 'Self-serve checkout' },
  { value: 'trial', label: '30-day trial' },
  { value: 'enterprise', label: 'Enterprise quote' },
]
const CYCLES = [
  { value: 'yearly', label: 'Yearly', period: '/yr' },
  { value: 'monthly', label: 'Monthly', period: '/mo' },
  { value: 'one_time', label: 'One-time', period: '' },
]
// Typing a country and then hand-typing its currency is two chances to get it
// wrong; the second follows from the first for every market we sell in.
const CURRENCY_BY_COUNTRY = {
  IN: 'INR', US: 'USD', GB: 'GBP', EU: 'EUR', DE: 'EUR', FR: 'EUR', NL: 'EUR',
  AE: 'AED', SA: 'SAR', SG: 'SGD', AU: 'AUD', CA: 'CAD', JP: 'JPY', MY: 'MYR',
}
// Pricing is flat per billing period — no seats, no unit, no minimum quantity.
// The period is therefore a consequence of the cycle, not a field to type.
const periodFor = (cycle) => CYCLES.find(c => c.value === cycle)?.period ?? '/yr'

const BLANK_PLAN = {
  module_id: '', code: '', name: '', description: '', scope: '',
  action: 'signup', billing_cycle: 'yearly',
  is_popular: false, is_active: true,
  is_custom: false, enquiry_id: null, quoted_to: '',
  features: [], excluded: [], prices: [
    { country_code: 'IN', currency: 'INR', amount: 0, period: '/yr', is_default: true },
  ],
}
const BLANK_PRICE = { country_code: 'IN', currency: 'INR', amount: 0, period: '/yr', is_default: false }

const currencyFromCode = (code) => ({ INR: '₹', USD: '$', GBP: '£', EUR: '€', JPY: '¥' }[code] || code)
const formatAmount = (amt, currency) => amt == null ? 'Custom' : `${currencyFromCode(currency)}${Number(amt).toLocaleString()}`
const slugifyCode = (name) => name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * A plan as the API returns it → the shape the form edits.
 *
 * The API speaks camelCase and the form speaks snake_case. Spreading a plan raw
 * used to leave billing_cycle, is_popular and is_active on their blank defaults
 * (so editing an inactive plan silently reactivated it on save) and left the
 * price rows in camelCase, where the form read `country_code` and found
 * nothing. Exported because Enquiries edits custom quotes through the same form.
 */
export const planToForm = (plan) => ({
  ...BLANK_PLAN,
  id: plan.id,
  module_id: plan.moduleId || '',
  code: plan.code || '',
  name: plan.name || '',
  description: plan.description || '',
  scope: plan.scope || '',
  action: plan.action || 'signup',
  billing_cycle: plan.billingCycle || 'yearly',
  is_popular: !!plan.isPopular,
  is_active: !!plan.isActive,
  is_custom: !!plan.isCustom,
  enquiry_id: plan.enquiryId || null,
  quoted_to: plan.quotedTo || '',
  features: plan.features || [],
  excluded: plan.excluded || [],
  prices: (plan.prices || []).map(p => ({
    country_code: p.countryCode, currency: p.currency,
    amount: p.amount, period: p.period, is_default: p.isDefault,
  })),
})

export default function Plans() {
  const [modules, setModules] = useState([])
  const [plans, setPlans] = useState([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [mods, planRes] = await Promise.all([API.platform.modules(), API.platform.plans()])
      setModules(mods.modules || [])
      setPlans(planRes.plans || [])
      setErr(null)
    } catch (e) {
      setErr(e.detail || e.message || 'Could not load plans')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Custom quotes are private to one enquiry — they belong in their own group,
  // not mixed into the catalogue tiers a buyer could actually pick from.
  const listed = useMemo(() => plans.filter(p => !p.isCustom), [plans])
  const customPlans = useMemo(() => plans.filter(p => p.isCustom), [plans])

  const filteredModules = useMemo(() => {
    const byCode = listed.reduce((acc, plan) => {
      const key = plan.moduleId || '__bundle__'
      acc[key] = acc[key] || []
      acc[key].push(plan)
      return acc
    }, {})
    return (filter ? modules.filter(m => m.name.toLowerCase().includes(filter.toLowerCase()) || m.code.toLowerCase().includes(filter.toLowerCase())) : modules)
      .map(m => ({ ...m, plans: byCode[m.id] || [] }))
  }, [modules, listed, filter])

  const rootPlans = useMemo(() => listed.filter(p => !p.moduleId), [listed])

  const handleDelete = async (plan) => {
    if (!window.confirm(`Delete plan ${plan.name}? This cannot be undone.`)) return
    try {
      await API.platform.deletePlan(plan.id)
      load()
    } catch (e) { setErr(e.detail || e.message) }
  }

  const openNew = () => setEditing({ ...BLANK_PLAN, prices: BLANK_PLAN.prices.map(p => ({ ...p })) })
  const openEdit = (plan) => setEditing(planToForm(plan))

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Plans & Pricing</div>
          <div className="panel-subtitle">
            Create, edit and price subscription tiers for each microservice. Add country-specific
            variants and choose a default fallback price.
          </div>
        </div>
        <button className="btn btn-primary" onClick={openNew}><Icon n="ti-plus" /> New plan</button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {!loading && (
        <div>
          <div className="panel-subtitle" style={{ marginBottom: 14 }}>
            Filter by microservice name or code.
          </div>
          <input className="hub-input" style={{ maxWidth: 360, marginBottom: 18 }}
            placeholder="Search microservices..." value={filter}
            onChange={e => setFilter(e.target.value)} />
        </div>
      )}

      {!loading && !filteredModules.length && !rootPlans.length && !customPlans.length && (
        <div className="dw-empty" style={{ padding: 40 }}>
          <Icon n="ti-inbox" /><span>No plans found yet. Create one to start pricing microservices.</span>
        </div>
      )}

      {!loading && (
        <div className="sa-plan-grid">
          {filteredModules.map(module => (
            <div className="sa-plan-module" key={module.id}>
              <div className="sa-plan-module-head" style={{ borderLeftColor: module.color }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{module.name}</div>
                  <div className="hint" style={{ fontSize: 12 }}>{module.code}</div>
                </div>
                <div className="hint">{module.plans.length} plan{module.plans.length !== 1 ? 's' : ''}</div>
              </div>
              {!module.plans.length ? (
                <div className="dw-empty" style={{ padding: 16, fontSize: 13 }}>
                  No plans yet for this microservice.
                </div>
              ) : module.plans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          ))}
          {rootPlans.length > 0 && (
            <div className="sa-plan-module" key="bundle">
              <div className="sa-plan-module-head" style={{ borderLeftColor: '#64748b' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Bundle / cross-module plans</div>
                  <div className="hint" style={{ fontSize: 12 }}>module_id unset</div>
                </div>
                <div className="hint">{rootPlans.length} plan{rootPlans.length !== 1 ? 's' : ''}</div>
              </div>
              {rootPlans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
          {customPlans.length > 0 && (
            <div className="sa-plan-module" key="custom">
              <div className="sa-plan-module-head" style={{ borderLeftColor: 'var(--accent-amber)' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>Custom quotes</div>
                  <div className="hint" style={{ fontSize: 12 }}>
                    Written for one request · never shown on the pricing page
                  </div>
                </div>
                <div className="hint">{customPlans.length} quote{customPlans.length !== 1 ? 's' : ''}</div>
              </div>
              {customPlans.map(plan => (
                <PlanCard key={plan.id} plan={plan} onEdit={openEdit} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      )}

      {editing && (
        <PlanForm
          initial={editing}
          modules={modules}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
          setBusy={setBusy}
          busy={busy}
        />
      )}
    </div>
  )
}

function PlanCard({ plan, onEdit, onDelete }) {
  const variants = (plan.prices || []).length
  return (
    <div className="sa-plan-card">
      <div className="sa-plan-card-top">
        <div>
          <div style={{ fontWeight: 700 }}>{plan.name}</div>
          <div className="hint" style={{ fontSize: 12 }}>{plan.code} · {plan.action}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div>{formatAmount(plan.price?.amount, plan.price?.currency)}</div>
          <div className="hint" style={{ fontSize: 12 }}>{plan.price?.period || 'price unknown'}</div>
        </div>
      </div>
      <div className="sa-plan-card-meta">
        <span>{variants} price variant{variants !== 1 ? 's' : ''}</span>
        {plan.isCustom && <span className="pill pill-amber">Custom</span>}
        {plan.isPopular && <span className="pill pill-purple">Popular</span>}
        {!plan.isActive && <span className="pill pill-red">Inactive</span>}
      </div>
      {plan.isCustom && plan.quotedTo && (
        <div className="hint" style={{ fontSize: 12 }}>
          <Icon n="ti-mail" /> Quoted to {plan.quotedTo}
        </div>
      )}
      <div className="sa-plan-card-actions">
        <button className="btn btn-ghost" onClick={() => onEdit(plan)}><Icon n="ti-edit" /> Edit</button>
        <button className="btn btn-ghost danger" onClick={() => onDelete(plan)}><Icon n="ti-trash" /> Delete</button>
      </div>
    </div>
  )
}

export function PlanForm({ initial, modules, onClose, onSaved, setBusy, busy }) {
  const isNew = !initial.id
  const [form, setForm] = useState(() => {
    const base = {
      ...BLANK_PLAN,
      ...initial,
      module_id: initial.moduleId || initial.module_id || '',
      features: initial.features || [],
      excluded: initial.excluded || [],
      prices: (initial.prices || []).map(p => ({ ...p })),
    }
    // A caller may hand us a pre-filled name (a quote drafted from an enquiry).
    // Derive its code here, or the form opens with a name and an empty code and
    // fails validation on a field the user never saw blank.
    if (!base.id && !base.code && base.name) base.code = slugifyCode(base.name)
    return base
  })
  const [featDraft, setFeatDraft] = useState('')
  const [excDraft, setExcDraft] = useState('')
  const [priceDraft, setPriceDraft] = useState({ ...BLANK_PRICE })
  // Errors used to be pushed to the page banner behind the modal, where nothing
  // the user did while the modal was open could ever be seen.
  const [formErr, setFormErr] = useState(null)
  // Once the code has been typed by hand, stop deriving it from the name.
  const [codeTouched, setCodeTouched] = useState(!isNew)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const setField = (key, value) => {
    setFormErr(null)
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // The period is a consequence of the billing cycle, so changing the cycle
      // has to restate every variant — otherwise a plan switched to monthly
      // keeps advertising "/yr" on prices that are now charged each month.
      if (key === 'billing_cycle') {
        const period = periodFor(value)
        next.prices = (prev.prices || []).map(p => ({ ...p, period }))
      }
      return next
    })
  }
  const setName = (value) => setForm(prev => ({
    ...prev,
    name: value,
    code: codeTouched ? prev.code : slugifyCode(value),
  }))
  const addFeature = () => {
    const v = featDraft.trim()
    if (!v) return
    setForm(prev => ({ ...prev, features: [...(prev.features || []), v] }))
    setFeatDraft('')
  }
  const addExcluded = () => {
    const v = excDraft.trim()
    if (!v) return
    setForm(prev => ({ ...prev, excluded: [...(prev.excluded || []), v] }))
    setExcDraft('')
  }
  const setDraft = (patch) => setPriceDraft(pd => {
    const next = { ...pd, ...patch }
    // Country drives currency until someone overrides it explicitly.
    if (patch.country_code !== undefined) {
      const cc = patch.country_code.toUpperCase()
      next.country_code = cc
      if (CURRENCY_BY_COUNTRY[cc]) next.currency = CURRENCY_BY_COUNTRY[cc]
    }
    return next
  })
  const draftCountry = (priceDraft.country_code || '').trim().toUpperCase()
  const period = periodFor(form.billing_cycle)
  const addPrice = () => {
    if (!draftCountry) { setFormErr('A price variant needs a country code.'); return }
    setFormErr(null)
    const entry = {
      ...priceDraft,
      country_code: draftCountry,
      currency: (priceDraft.currency || 'INR').trim().toUpperCase(),
      period,
    }
    setForm(prev => {
      const existing = (prev.prices || []).findIndex(p => (p.country_code || '').toUpperCase() === draftCountry)
      // Two prices for one country is not a variant, it is a bug — replace.
      const prices = existing >= 0
        ? prev.prices.map((p, i) => i === existing ? { ...entry, is_default: p.is_default } : p)
        : [...(prev.prices || []), { ...entry, is_default: !(prev.prices || []).length }]
      return { ...prev, prices }
    })
    setPriceDraft({ ...BLANK_PRICE })
  }
  const setDefaultPrice = (index) => {
    setForm(prev => ({ ...prev, prices: prev.prices.map((p, i) => ({ ...p, is_default: i === index })) }))
  }
  const removePrice = (index) => {
    setForm(prev => {
      const dropped = prev.prices[index]
      const next = prev.prices.filter((_, i) => i !== index)
      // Never leave the list without a default — the storefront reads it.
      return {
        ...prev,
        prices: dropped?.is_default && next.length
          ? next.map((p, i) => ({ ...p, is_default: i === 0 }))
          : next,
      }
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setFormErr('Plan name is required.'); return }
    if (!form.code.trim()) { setFormErr('Plan code is required.'); return }
    if (!(form.prices || []).length) { setFormErr('Add at least one price variant.'); return }
    setBusy(true)
    setFormErr(null)
    const body = {
      module_id: form.module_id || null,
      code: form.code.trim(),
      name: form.name.trim(),
      description: form.description,
      scope: form.scope,
      action: form.action,
      billing_cycle: form.billing_cycle,
      quoted_to: form.quoted_to || '',
      is_popular: !!form.is_popular,
      is_active: !!form.is_active,
      features: form.features || [],
      excluded: form.excluded || [],
      prices: (form.prices || []).map(p => ({
        country_code: p.country_code || 'IN',
        currency: p.currency || 'INR',
        amount: Number(p.amount) || 0,
        // Always the cycle's period: a stale one saved before the cycle changed
        // would price the plan differently from how it is billed.
        period,
        is_default: !!p.is_default,
      })),
    }
    try {
      // Whether a plan is a custom quote, and which request it answers, is
      // settled when it is created; a PATCH must not be able to move it.
      if (isNew) await API.platform.createPlan({
        ...body, is_custom: !!form.is_custom, enquiry_id: form.enquiry_id || null,
      })
      else await API.platform.updatePlan(initial.id, body)
      onSaved()
    } catch (e) {
      setFormErr(e.detail || e.message || 'Could not save this plan.')
    } finally {
      setBusy(false)
    }
  }

  const moduleName = modules.find(m => m.id === form.module_id)?.name || 'Bundle / cross-module'
  const defaultPrice = (form.prices || []).find(p => p.is_default) || (form.prices || [])[0]

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <form className="ms-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="ms-modal-head">
          <div>
            <div className="panel-title">
              {isNew ? (form.is_custom ? 'New custom quote' : 'New plan')
                : `Edit ${initial.name}`}
              {form.is_custom && <span className="pill pill-amber" style={{ marginLeft: 8 }}>Custom</span>}
            </div>
            <div className="ms-modal-sub">
              {form.is_custom
                ? <>Priced for one request{form.quoted_to ? <> · {form.quoted_to}</> : null} — never listed on the pricing page or the marketplace.</>
                : isNew
                  ? 'Name the tier, describe what it includes, then price it per country.'
                  : `${moduleName} · ${initial.code}`}
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close"><Icon n="ti-x" /></button>
        </div>

        <div className="ms-form">
          <div className="ms-section">
            <div className="ms-section-head">
              <b>Identity</b><span>What this tier is and where it sells.</span>
            </div>
            <label className="ms-f">
              <span>Plan name</span>
              <input value={form.name} onChange={e => setName(e.target.value)} placeholder="Enterprise+" autoFocus />
            </label>
            <label className="ms-f">
              <span>Plan code {isNew ? <em>— auto from name</em> : <em>— fixed after creation</em>}</span>
              <input value={form.code} disabled={!isNew}
                onChange={e => { setCodeTouched(true); setField('code', e.target.value) }}
                placeholder="enterprise-plus" />
            </label>
            <label className="ms-f full">
              <span>Microservice</span>
              <select value={form.module_id} onChange={e => setField('module_id', e.target.value)}>
                <option value="">Bundle / no module</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
              </select>
            </label>
            <label className="ms-f full">
              <span>Description</span>
              <input value={form.description} onChange={e => setField('description', e.target.value)}
                placeholder="Short plan description shown on the storefront card" />
            </label>
            <label className="ms-f full">
              <span>Scope <em>— the one-line qualifier under the price</em></span>
              <input value={form.scope} onChange={e => setField('scope', e.target.value)}
                placeholder="2–8 seats · training centre" />
            </label>
          </div>

          <div className="ms-section">
            <div className="ms-section-head">
              <b>Commercials</b>
              <span>Priced flat per period — one amount for the whole organisation.</span>
            </div>
            <label className="ms-f">
              <span>Action</span>
              <select value={form.action} onChange={e => setField('action', e.target.value)}>
                {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </label>
            <label className="ms-f">
              <span>Billing cycle <em>— sets the period on every price</em></span>
              <select value={form.billing_cycle} onChange={e => setField('billing_cycle', e.target.value)}>
                {CYCLES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            {form.is_custom && (
              <label className="ms-f full">
                <span>Quoted to</span>
                <input value={form.quoted_to} onChange={e => setField('quoted_to', e.target.value)}
                  placeholder="buyer@company.com" />
              </label>
            )}
            <label className="ms-f ms-toggle">
              <input type="checkbox" checked={!!form.is_popular} disabled={!!form.is_custom}
                onChange={e => setField('is_popular', e.target.checked)} />
              <span><b>Mark as popular</b><em>{form.is_custom
                ? 'Not applicable — a custom quote is never on the storefront.'
                : 'Highlights this tier on the storefront.'}</em></span>
            </label>
            <label className="ms-f ms-toggle">
              <input type="checkbox" checked={!!form.is_active}
                onChange={e => setField('is_active', e.target.checked)} />
              <span><b>Active</b><em>{form.is_custom
                ? 'Inactive quotes stay on record but cannot be granted.'
                : 'Inactive plans stay saved but are hidden from buyers.'}</em></span>
            </label>
          </div>

          <div className="ms-section">
            <div className="ms-section-head">
              <b>What's included</b><span>Press Enter to add each line.</span>
            </div>
            <div className="ms-f full">
              <span>Features</span>
              <div className="ms-feat-add">
                <input value={featDraft} onChange={e => setFeatDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                  placeholder="Type a feature and press Enter" />
                <button type="button" className="btn btn-ghost" onClick={addFeature} disabled={!featDraft.trim()}>
                  <Icon n="ti-plus" /> Add</button>
              </div>
              <div className="ms-chips">
                {(form.features || []).map((f, i) => (
                  <span className="ms-chip" key={i}>
                    {f}<button type="button" aria-label={`Remove ${f}`}
                      onClick={() => setField('features', form.features.filter((_, j) => j !== i))}>
                      <Icon n="ti-x" /></button>
                  </span>
                ))}
                {!(form.features || []).length && <span className="ms-hint">No features yet.</span>}
              </div>
            </div>
            <div className="ms-f full">
              <span>Explicitly not included</span>
              <div className="ms-feat-add">
                <input value={excDraft} onChange={e => setExcDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExcluded() } }}
                  placeholder="Type something not included and press Enter" />
                <button type="button" className="btn btn-ghost" onClick={addExcluded} disabled={!excDraft.trim()}>
                  <Icon n="ti-plus" /> Add</button>
              </div>
              <div className="ms-chips">
                {(form.excluded || []).map((f, i) => (
                  <span className="ms-chip exc" key={i}>
                    {f}<button type="button" aria-label={`Remove ${f}`}
                      onClick={() => setField('excluded', form.excluded.filter((_, j) => j !== i))}>
                      <Icon n="ti-x" /></button>
                  </span>
                ))}
                {!(form.excluded || []).length && <span className="ms-hint">No exclusions yet.</span>}
              </div>
            </div>
          </div>

          <div className="ms-section">
            <div className="ms-section-head">
              <b>Pricing</b><span>One flat amount per country. The default is charged everywhere else.</span>
            </div>
            <div className="ms-f full">
              <div className="ms-price-grid">
                <label className="ms-pf">
                  <span>Country</span>
                  <input value={priceDraft.country_code} maxLength={2}
                    onChange={e => setDraft({ country_code: e.target.value })} placeholder="IN" />
                </label>
                <label className="ms-pf">
                  <span>Currency</span>
                  <input value={priceDraft.currency} maxLength={3}
                    onChange={e => setDraft({ currency: e.target.value.toUpperCase() })} placeholder="INR" />
                </label>
                <label className="ms-pf">
                  <span>Amount</span>
                  <input type="number" min="0" value={priceDraft.amount}
                    onChange={e => setDraft({ amount: Number(e.target.value) })} placeholder="0" />
                </label>
                <div className="ms-pf">
                  <span>Period</span>
                  <div className="ms-pf-derived" title="Set by the billing cycle above">
                    {period || 'one-time'}
                  </div>
                </div>
                <button type="button" className="btn btn-primary" onClick={addPrice} disabled={!draftCountry}>
                  <Icon n="ti-plus" /> Add price
                </button>
              </div>
              <div className="sa-prices-table">
                {(form.prices || []).map((price, index) => (
                  <div className={`sa-price-row${price.is_default ? ' is-default' : ''}`} key={index}>
                    <div className="sa-price-row-meta">
                      <span className="sa-price-cc">{price.country_code}</span>
                      <span className="sa-price-amt">{formatAmount(price.amount, price.currency)}</span>
                      <span className="sa-price-per">{price.period || 'one-time'}</span>
                    </div>
                    <div className="sa-price-actions">
                      <label className="sa-price-def">
                        <input type="radio" name="default-price" checked={!!price.is_default}
                          onChange={() => setDefaultPrice(index)} />
                        {price.is_default ? 'Default' : 'Make default'}
                      </label>
                      <button type="button" className="btn btn-ghost danger"
                        aria-label={`Remove ${price.country_code} price`} onClick={() => removePrice(index)}>
                        <Icon n="ti-trash" /></button>
                    </div>
                  </div>
                ))}
                {!(form.prices || []).length && (
                  <div className="sa-prices-empty">
                    <Icon n="ti-tag" /> No price variants yet — add at least one above.
                  </div>
                )}
              </div>
            </div>
          </div>

          {formErr && <div className="ms-alert"><Icon n="ti-alert-circle" /><span>{formErr}</span></div>}
        </div>

        <div className="ms-modal-foot">
          <span className="ms-foot-hint">
            {defaultPrice
              ? <>{form.is_custom ? 'Quoted at ' : 'Sells at '}
                <b>{formatAmount(defaultPrice.amount, defaultPrice.currency)}{period}</b> by default
                {(form.prices || []).length > 1 ? ` · ${form.prices.length} variants` : ''}</>
              : 'No price set yet'}
          </span>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />}{' '}
            {busy ? 'Saving…' : form.is_custom ? 'Save quote' : 'Save plan'}
          </button>
        </div>
      </form>
    </div>
  )
}
