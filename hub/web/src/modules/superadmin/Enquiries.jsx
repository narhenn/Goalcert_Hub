// Enquiries.jsx — custom-quote requests raised from the public pricing page.
//
// A visitor who selects more than one service (or an enterprise tier) lands
// here instead of in a checkout. Each row shows whether the sales alert email
// actually went out; when SMTP isn't configured it says so rather than
// implying somebody was notified.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'
import { PlanForm, planToForm } from './Plans.jsx'

const STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost']
const TONE = { new: 'purple', contacted: 'amber', quoted: 'amber', won: 'green', lost: 'red' }

const currencySymbol = (c) => ({ INR: '₹', USD: '$', GBP: '£', EUR: '€', JPY: '¥' }[c] || c)

// A request already says who is asking, for what, and in what words. Carrying
// that into the quote means the person writing it starts from the enquiry
// rather than from an empty form.
function quoteFromEnquiry(e, modules) {
  const wanted = (e.moduleCodes || [])
    .map(code => modules.find(m => m.code === code))
    .filter(Boolean)
  return {
    module_id: wanted.length === 1 ? wanted[0].id : '',   // one service → attach it; several → a bundle
    code: '', name: `${e.company || e.contactName || e.email} — custom`,
    description: e.message ? e.message.slice(0, 240) : '',
    scope: [e.company, e.country].filter(Boolean).join(' · '),
    action: 'enterprise', billing_cycle: 'yearly',
    is_popular: false, is_active: true,
    is_custom: true, enquiry_id: e.id, quoted_to: e.email,
    features: wanted.map(m => m.name),
    excluded: [],
    prices: [{ country_code: 'IN', currency: 'INR', amount: 0, period: '/yr', is_default: true }],
  }
}

export default function Enquiries() {
  const [rows, setRows] = useState([])
  const [counts, setCounts] = useState({})
  const [modules, setModules] = useState([])
  const [filter, setFilter] = useState(null)
  const [open, setOpen] = useState(null)
  const [err, setErr] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quoting, setQuoting] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [d, mods] = await Promise.all([
        API.platform.enquiries(filter),
        API.platform.modules(),
      ])
      setRows(d.enquiries); setCounts(d.counts || {})
      setModules(mods.modules || []); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [filter])
  useEffect(() => { load() }, [load])

  const setStatus = async (e, status) => {
    try { await API.platform.updateEnquiry(e.id, { status }); load(); setOpen(null) }
    catch (er) { setErr(er.detail || er.message) }
  }

  const deleteEnquiry = async (e) => {
    if (!window.confirm(`Delete enquiry from ${e.email || e.company || 'this lead'}?`)) return
    try {
      await API.platform.deleteEnquiry(e.id)
      load()
    } catch (er) { setErr(er.detail || er.message) }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Enquiries</div>
          <div className="panel-subtitle">
            Custom-quote requests from the pricing page — {counts.new || 0} new of {total}.
          </div>
        </div>
        <div className="seg">
          <button className={!filter ? 'on' : ''} onClick={() => setFilter(null)}>All</button>
          {STATUSES.map(s => (
            <button key={s} className={filter === s ? 'on' : ''} onClick={() => setFilter(s)}>
              {s}{counts[s] ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {!loading && !rows.length && (
        <div className="dw-empty" style={{ padding: 40 }}>
          <Icon n="ti-inbox" /><span>No enquiries{filter ? ` with status "${filter}"` : ''} yet.</span>
        </div>
      )}

      <div className="enq-list">
        {rows.map(e => (
          <div className="enq" key={e.id} onClick={() => setOpen(open === e.id ? null : e.id)}>
            <div className="enq-main">
              <div className="enq-top">
                <b>{e.company || e.contactName || e.email}</b>
                <span className={`pill pill-${TONE[e.status] || 'surface'}`}>{e.status}</span>
                {!e.notified && (
                  <span className="pill pill-red" title="No SMTP configured — sales was not emailed">
                    not emailed
                  </span>
                )}
              </div>
              <div className="enq-sub">
                {e.contactName && `${e.contactName} · `}{e.email}
                {e.phone && ` · ${e.phone}`}{e.country && ` · ${e.country}`}
              </div>
              <div className="enq-mods">
                {(e.moduleCodes || []).map(c => <span className="ms-chip sm" key={c}>{c}</span>)}
                {!!e.seats && <span className="enq-seats">{e.seats} users</span>}
              </div>
            </div>
            <div className="enq-date">
              {e.createdAt ? new Date(e.createdAt).toLocaleDateString() : ''}
            </div>

            {open === e.id && (
              <div className="enq-detail" onClick={ev => ev.stopPropagation()}>
                {e.message && <p className="enq-msg">{e.message}</p>}

                {(e.customPlans || []).length > 0 && (
                  <div className="enq-quotes">
                    {e.customPlans.map(q => (
                      <div className="enq-quote" key={q.id}>
                        <Icon n="ti-file-invoice" />
                        <b>{q.name}</b>
                        <span className="enq-quote-amt">
                          {q.price
                            ? `${currencySymbol(q.price.currency)}${Number(q.price.amount).toLocaleString()}${q.price.period}`
                            : 'no price'}
                        </span>
                        {!q.isActive && <span className="pill pill-red">inactive</span>}
                        <button className="btn btn-ghost" onClick={() => setQuoting({ enquiry: e, plan: q })}>
                          <Icon n="ti-edit" /> Edit quote
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="enq-actions">
                  <button className="btn btn-primary" onClick={() => setQuoting({ enquiry: e, plan: null })}>
                    <Icon n="ti-file-plus" /> Create custom plan
                  </button>
                  <a className="btn btn-ghost" href={`mailto:${e.email}?subject=Your quote request`}>
                    <Icon n="ti-mail" /> Reply
                  </a>
                  <span>Move to:</span>
                  {STATUSES.filter(s => s !== e.status).map(s => (
                    <button key={s} className="btn btn-ghost" onClick={() => setStatus(e, s)}>{s}</button>
                  ))}
                  <button className="btn btn-ghost danger" onClick={() => deleteEnquiry(e)}>
                    <Icon n="ti-trash" /> Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {quoting && (
        <PlanForm
          initial={quoting.plan ? planToForm(quoting.plan)
                                : quoteFromEnquiry(quoting.enquiry, modules)}
          modules={modules}
          onClose={() => setQuoting(null)}
          // Creating the quote is what moves the enquiry to "quoted" — the
          // server does that, so reload rather than guessing the new status.
          onSaved={() => { setQuoting(null); load() }}
          setBusy={setBusy}
          busy={busy}
        />
      )}
    </div>
  )
}
