// PricingFunnel.jsx — the NXG self-serve pricing funnel.
//
//   1 Your Details → 2 Products → 3 Select Plan → 4 Confirm
//
// Step 4 forks on the chosen tier's `action`:
//   4a signup     → instant checkout (qty, card/UPI/net-banking, order summary)
//   4b enterprise → guided POC / sales enquiry  (also used for multi-product bundles)
//   4c trial      → 30-day free trial activation
//   5  success    → reference number + what-happens-next
//
// Submissions now PERSIST. Every path posts to /api/public/enquiries, so the
// request lands in the platform owner's Enquiries inbox and (when SMTP is
// configured) alerts sales. `source` distinguishes them:
//   bundle   → more than one service selected, needs a custom quote
//   sales    → a single enterprise tier
//   trial    → 30-day trial request
//   checkout → a self-serve tier. Recorded as a lead, NOT charged: no payment
//              gateway is wired yet, so this must not pretend money moved.
import React, { useEffect, useState } from 'react'
import { fmtINR, fmtMoney, genRef } from './products.js'
import ProdIcon from './ProdIcon.jsx'
import { navigate } from '../router.jsx'
import API from '../api.js'

const ChevR = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
  </svg>
)
const ChevL = () => (
  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
  </svg>
)

const priceAmount = (price) => {
  if (price == null) return null
  return typeof price === 'object' ? price.amount : price
}

const priceCurrency = (price) => {
  if (price == null) return 'INR'
  return typeof price === 'object' ? price.currency || 'INR' : 'INR'
}

const pricedValue = (price, annual, perMonth) => {
  const amount = priceAmount(price)
  if (amount == null) return null
  if (perMonth) return amount
  return annual ? amount : Math.ceil((amount / 12) * 1.1)
}

const formatPrice = (price, annual = true, perMonth = false) => {
  const amount = pricedValue(price, annual, perMonth)
  if (amount == null) return 'Custom'
  return fmtMoney({ amount, currency: priceCurrency(price) })
}

const STEPS = [
  { n: 1, label: 'Your Details' },
  { n: 2, label: 'Microservices' },
  { n: 3, label: 'Select Plan' },
  { n: 4, label: 'Confirm' },
]

// 4a/4b/4c all sit on progress step 4; the success screen is past the track.
const progressStep = s => (typeof s === 'number' ? s : String(s).startsWith('4') ? 4 : 5)

// `products` are the published microservices, passed down from PublicSite. The
// default is empty, not a hardcoded catalogue: the funnel must never quote a
// service the platform does not actually sell.
export default function PricingFunnel({ initialProduct, products = [], country = 'IN', onCountryChange = () => {}, catalogueNote }) {
  const [step, setStep] = useState(1)
  const [customer, setCustomer] = useState({
    firstName: '', lastName: '', email: '', company: '', phone: '', size: '', country: 'India',
  })
  const [errs, setErrs] = useState({})
  const [selProds, setSelProds] = useState(() => (initialProduct && products.find(p => p.id === initialProduct) ? [initialProduct] : []))
  const [curProd, setCurProd] = useState(null)
  const [tierIdx, setTierIdx] = useState(-1)
  const [qty, setQty] = useState(1)
  const [annual, setAnnual] = useState(true)
  const [salesMode, setSalesMode] = useState('tier') // 'tier' | 'bundle'
  const [salesBackStep, setSalesBackStep] = useState(3)
  const [loader, setLoader] = useState(null)
  const [success, setSuccess] = useState(null)
  const [sendErr, setSendErr] = useState(null)

  const isBundle = selProds.length > 1
  const selTier = curProd && tierIdx >= 0 ? curProd.tiers[tierIdx] : null
  const priceAmount = (price) => {
    if (price == null) return null
    return typeof price === 'object' ? price.amount : price
  }
  const priceCurrency = (price) => {
    if (price == null) return 'INR'
    return typeof price === 'object' ? price.currency || 'INR' : 'INR'
  }
  const pricedValue = (price, annual, perMonth) => {
    const amount = priceAmount(price)
    if (amount == null) return null
    if (perMonth) return amount
    return annual ? amount : Math.ceil((amount / 12) * 1.1)
  }
  const formatPrice = (price, annual = true, perMonth = false) => {
    const amount = pricedValue(price, annual, perMonth)
    if (amount == null) return 'Custom'
    return fmtMoney({ amount, currency: priceCurrency(price) })
  }

  const go = s => { setStep(s); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  useEffect(() => {
    if (initialProduct && selProds.length === 0) {
      const exists = products.find(p => p.id === initialProduct)
      if (exists) setSelProds([initialProduct])
    }
  }, [initialProduct, products, selProds.length])

  // ── step 1 ────────────────────────────────────────────────────────
  const countryMap = {
    India: 'IN', Australia: 'AU', Singapore: 'SG',
    'United Arab Emirates': 'AE', 'United States': 'US',
    'United Kingdom': 'GB', Other: 'IN',
  }
  const set = (k, v) => {
    setCustomer(c => ({ ...c, [k]: v }))
    if (k === 'country') onCountryChange(countryMap[v] || 'IN')
  }

  function s1next() {
    const e = {}
    if (!customer.firstName.trim()) e.firstName = 'Required'
    if (!customer.lastName.trim()) e.lastName = 'Required'
    if (!customer.email.trim()) e.email = 'Required'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) e.email = 'Enter a valid email'
    if (!customer.company.trim()) e.company = 'Required'
    setErrs(e)
    if (Object.keys(e).length) return
    go(2)
  }

  // ── step 2 ────────────────────────────────────────────────────────
  const togProd = id =>
    setSelProds(list => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]))

  function s2next() {
    if (!selProds.length) { window.alert('Please select at least one microservice.'); return }
    if (selProds.length > 1) { setSalesMode('bundle'); setSalesBackStep(2); go('4b') }
    else {
      const product = products.find(p => p.id === selProds[0])
      if (!product) { window.alert('Selected microservice not found.'); return }
      setCurProd(product); setTierIdx(-1); go(3)
    }
  }

  // ── step 3 → 4 ────────────────────────────────────────────────────
  function pickSignup(ti) {
    setTierIdx(ti); setQty(curProd.minQty[ti] || 1); go('4a')
  }
  function pickTrial(ti) { setTierIdx(ti); setQty(curProd.minQty[ti] || 1); go('4c') }
  function pickSales(ti) { setTierIdx(ti); setSalesMode('tier'); setSalesBackStep(3); go('4b') }

  // ── submissions (simulated) ───────────────────────────────────────
  // Persist first, celebrate second. If the request cannot be saved we say so
  // instead of showing a reference number for something nobody received.
  async function submit(msg, delay, build, enquiry) {
    setLoader(msg)
    setSendErr(null)
    try {
      if (enquiry) await API.public.enquiry(enquiry())
      setLoader(null)
      setSuccess(build(genRef()))
      go(5)
    } catch (e) {
      setLoader(null)
      setSendErr(e.detail || e.message || 'We could not send your request. Please try again.')
    }
  }

  /** Map the funnel's state onto an enquiry row. */
  const buildEnquiry = (source, codes, seats = 0, note = '') => () => ({
    email: customer.email,
    company: customer.company,
    contact_name: `${customer.firstName} ${customer.lastName}`.trim(),
    phone: customer.phone,
    country: customer.country,
    module_codes: codes,
    seats: Number(seats) || 0,
    source,
    message: [note, customer.size && `Company size: ${customer.size}`]
      .filter(Boolean).join('\n'),
  })

  return (
    <>
      <div className="pgwrap">
        <div className="pgtrack">
          {STEPS.map((s, i) => {
            const cur = progressStep(step)
            const done = s.n < cur
            const act = s.n === cur
            return (
              <React.Fragment key={s.n}>
                {i > 0 && <div className={`pgline ${STEPS[i - 1].n < cur ? 'done' : ''}`} />}
                <div className="pgstep">
                  <div className={`pgdot ${done ? 'done' : ''} ${act ? 'act' : ''}`}>{done ? '✓' : s.n}</div>
                  <div className={`pglbl ${done ? 'done' : ''} ${act ? 'act' : ''}`}>{s.label}</div>
                </div>
              </React.Fragment>
            )
          })}
        </div>
      </div>

      <div className="swrap">
        {step === 1 && <Details c={customer} set={set} errs={errs} onNext={s1next} />}

        {step === 2 && (
          <ProductStep sel={selProds} products={products} onToggle={togProd} isBundle={isBundle} onBack={() => go(1)} onNext={s2next} />
        )}

        {step === 3 && curProd && (
          <TierStep p={curProd} annual={annual} onToggleBilling={() => setAnnual(a => !a)}
            onChange={() => go(2)} onSignup={pickSignup} onTrial={pickTrial} onSales={pickSales} />
        )}

        {sendErr && (
          <div className="pg-senderr" role="alert">
            <b>Could not send your request.</b> {sendErr}
          </div>
        )}

        {step === '4a' && selTier && (
          <Checkout p={curProd} t={selTier} tierIdx={tierIdx} qty={qty} setQty={setQty} annual={annual}
            onBack={() => go(3)}
            onSubmit={() => submit('Setting up your account…', 2200,
              ref => paySuccess({ p: curProd, t: selTier, qty, customer, ref }),
              // Recorded as a lead, not a payment — no gateway is wired yet.
              buildEnquiry('checkout', [curProd?.id].filter(Boolean), qty,
                `Self-serve signup: ${curProd?.name} — ${selTier?.name} × ${qty}.`))} />
        )}

        {step === '4b' && (
          <SalesForm mode={salesMode} prods={salesMode === 'bundle' ? selProds.map(id => products.find(p => p.id === id)).filter(Boolean) : [curProd]}
            t={salesMode === 'bundle' ? null : selTier} onBack={() => go(salesBackStep)}
            onSubmit={() => submit('Sending to our team…', 1800, ref => salesSuccess({
              prods: salesMode === 'bundle' ? selProds.map(id => products.find(p => p.id === id)).filter(Boolean) : [curProd],
              isPOC: salesMode !== 'bundle' && selTier?.action === 'enterprise', customer, ref,
            }), buildEnquiry(
              salesMode === 'bundle' ? 'bundle' : 'sales',
              salesMode === 'bundle' ? selProds : [curProd?.id].filter(Boolean),
              qty,
              salesMode === 'bundle'
                ? `Custom quote requested for ${selProds.length} services.`
                : `Enterprise enquiry for ${curProd?.name} — ${selTier?.name}.`,
            ))} />
        )}

        {step === '4c' && selTier && (
          <TrialForm p={curProd} t={selTier} onBack={() => go(3)}
            onSubmit={() => submit('Activating your trial…', 2000,
              ref => trialSuccess({ p: curProd, t: selTier, customer, ref }),
              buildEnquiry('trial', [curProd?.id].filter(Boolean), qty,
                `30-day trial requested: ${curProd?.name} — ${selTier?.name}.`))} />
        )}

        {step === 5 && success && <Success {...success} />}
      </div>

      {loader && (
        <div className="nxg-loader">
          <div className="spin" />
          <div className="loadmsg">{loader}</div>
        </div>
      )}
    </>
  )
}

/* ══ STEP 1 ══════════════════════════════════════════════ */
// Hoisted out of Details on purpose: a component defined inside the parent's
// render is a new type on every keystroke, so React would remount the <input>
// and the field would lose focus after each character.
function TextField({ k, label, c, set, errs, ...rest }) {
  return (
    <div className={`field ${errs[k] ? 'err' : ''}`}>
      <label>{label}</label>
      <input value={c[k]} onChange={e => set(k, e.target.value)} {...rest} />
      {errs[k] && <div className="errmsg">{errs[k]}</div>}
    </div>
  )
}

function Details({ c, set, errs, onNext }) {
  const f = { c, set, errs }
  return (
    <div className="step">
      <div className="fcard">
        <h2>Let's get started</h2>
        <p className="sub">Tell us about yourself so we can personalise your experience and pricing.</p>
        <div className="g2">
          <TextField {...f} k="firstName" label="First Name" placeholder="Raj" />
          <TextField {...f} k="lastName" label="Last Name" placeholder="Kumar" />
        </div>
        <TextField {...f} k="email" label="Work Email" type="email" placeholder="raj@organisation.com" />
        <TextField {...f} k="company" label="Organisation / Company" placeholder="Indian Army / Acme Corp" />
        <div className="g2">
          <TextField {...f} k="phone" label="Phone (optional)" type="tel" placeholder="+91 98765 43210" />
          <div className="field">
            <label>Organisation Size</label>
            <select value={c.size} onChange={e => set('size', e.target.value)}>
              <option value="">Select size</option>
              <option>1–10 people</option><option>11–50 people</option>
              <option>51–200 people</option><option>201–500 people</option>
              <option>500+ people</option><option>Government / Defence</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Country</label>
          <select value={c.country} onChange={e => set('country', e.target.value)}>
            <option value="">Select country</option>
            <option>India</option><option>Australia</option><option>Singapore</option>
            <option>United Arab Emirates</option><option>United States</option>
            <option>United Kingdom</option><option>Other</option>
          </select>
        </div>
        <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn bp" onClick={onNext}>Continue <ChevR /></button>
        </div>
      </div>
    </div>
  )
}

/* ══ STEP 2 ══════════════════════════════════════════════ */
function ProductStep({ sel, onToggle, isBundle, onBack, onNext, products }) {
  return (
    <div className="step">
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 21, fontWeight: 700, marginBottom: 4 }}>Which microservices interest you?</h2>
        <p style={{ fontSize: 13, color: 'var(--t2)' }}>Select one for instant pricing, or multiple for a custom bundle quote.</p>
      </div>
      {isBundle && (
        <div className="bnotice">
          <div className="bnico">🎁</div>
          <div className="bntxt">
            <h4>Multiple microservices selected — Bundle pricing available</h4>
            <p>Our sales team will design a custom bundle with combined pricing and a single point of contact for all of them.</p>
          </div>
        </div>
      )}
      {/* Nothing hardcoded backs this grid any more, so an empty catalogue has
          to explain itself rather than render as a blank step. */}
      {!products.length && (
        <div className="lstate">
          <strong>No microservices are published yet.</strong>
          <span>Please check back shortly, or contact our team for a quote.</span>
        </div>
      )}
      <div className="pgrid">
        {products.map(p => {
          const on = sel.includes(p.id)
          return (
            <button key={p.id} className={`pcard ${on ? 'selected' : ''}`} onClick={() => onToggle(p.id)}
              style={{ color: p.color, borderColor: on ? p.color : undefined, boxShadow: on ? `0 0 0 3px ${p.color}22` : undefined }}>
              <div className="pchk" />
              <div className="pico"><ProdIcon icon={p.icon} /></div>
              <div className="pname">{p.name}</div>
              <div className="ptag">{p.tag}</div>
              <div className="pdesc">{p.desc}</div>
            </button>
          )
        })}
      </div>
      <div className="btn-row">
        <button className="btn bgh" onClick={onBack}><ChevL /> Back</button>
        <button className="btn bp" onClick={onNext}>Continue <ChevR /></button>
      </div>
    </div>
  )
}

/* ══ STEP 3 — TIERS ══════════════════════════════════════ */
function TierStep({ p, annual, onToggleBilling, onChange, onSignup, onTrial, onSales }) {
  return (
    <div className="step">
      <div className="pctx">
        <div className="ico"><ProdIcon icon={p.icon} /></div>
        <div>
          <h3>{p.name}</h3>
          <p>{p.tag}</p>
        </div>
        <button className="pctx-change" style={{ color: p.color }} onClick={onChange}>← Change</button>
      </div>

      <div className="billing-row">
        <span>Monthly</span>
        <button className={`tpill ${annual ? 'on' : ''}`} onClick={onToggleBilling} aria-label="Toggle billing period" />
        <span>Annual</span>
        {!p.perMonth && <div className="disc-tag">Save up to 20%</div>}
      </div>

      <div className="istrip">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          <strong style={{ color: 'var(--g)' }}>Sign Up &amp; Use</strong> tiers activate instantly — no sales call needed.
          &ensp;<strong style={{ color: 'var(--a)' }}>30-Day Free Trial</strong> available on professional and enterprise tiers.
          &ensp;<strong style={{ color: 'var(--v)' }}>Enterprise+</strong> includes a guided POC with dedicated engineering support.
        </span>
      </div>

      <div className="tgrid">
        {p.tiers.map((t, ti) => {
          const amount = priceAmount(t.price)
          const disp = amount != null && !annual && !p.perMonth ? Math.ceil((amount / 12) * 1.1) : amount
          const pLabel = t.priceLabel || (amount != null ? fmtMoney({ amount: disp, currency: priceCurrency(t.price) }) : 'Custom')
          const uLabel = t.usdLabel || ''
          const perLabel = t.period && !t.priceLabel ? t.period + (annual && !p.perMonth ? ' · annual' : '') : ''
          return (
            <div key={t.name} className={`tcard ${t.popular ? 'hot' : ''}`} data-action={t.action}>
              <div className="card-badges">
                {t.popular && <div className="cbadge cb-popular">Most Popular</div>}
                {t.action === 'signup' && <div className="cbadge cb-signup">Sign Up &amp; Use</div>}
                {t.action === 'trial' && <div className="cbadge cb-trial">30-Day Free Trial</div>}
                {t.action === 'enterprise' && <div className="cbadge cb-ep">Enterprise+</div>}
              </div>
              <div className="tname">{t.name}</div>
              <div className="tprice" style={{ color: p.color }}>
                {pLabel}{t.price && p.unit === 'learner' ? <sub>/learner</sub> : null}
              </div>
              <div className="tperiod">{perLabel || 'Contact for pricing'}</div>
              <div className="tusd">{uLabel}</div>
              <div className="tscope">{t.scope}</div>
              <ul className="tfeats">
                {t.feats.map(f => <li key={f}><span className="fy">✓</span><span>{f}</span></li>)}
                {t.notincl.map(f => <li key={f}><span className="fn">—</span><span style={{ color: 'var(--t3)' }}>{f}</span></li>)}
              </ul>
              <div className="tcta-wrap">
                {t.action === 'signup' && (
                  <button className="btn-signup" onClick={() => onSignup(ti)}>→ Sign Up &amp; Use</button>
                )}
                {t.action === 'trial' && (
                  <>
                    <button className="btn-trial" onClick={() => onTrial(ti)}>🎯 Start 30-Day Free Trial</button>
                    <button className="btn-sales-sec" onClick={() => onSales(ti)}>or Contact Sales</button>
                  </>
                )}
                {t.action === 'enterprise' && (
                  <>
                    <button className="btn-ep" onClick={() => onSales(ti)}>Request POC / Trial →</button>
                    <button className="btn-sales-sec" onClick={() => onSales(ti)}>Contact Sales</button>
                    <div className="trial-note">Guided 30-day POC available</div>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="btn-row">
        <button className="btn bgh" onClick={onChange}><ChevL /> Back</button>
      </div>
    </div>
  )
}

/* ══ STEP 4A — CHECKOUT ══════════════════════════════════ */
function unitPrice(p, t, annual) {
  const amount = priceAmount(t.price)
  if (amount == null) return 0
  if (p.perMonth) return amount
  return annual ? amount : Math.ceil((amount / 12) * 1.1)
}

function Checkout({ p, t, tierIdx, qty, setQty, annual, onBack, onSubmit }) {
  const [pay, setPay] = useState('card')
  const [upi, setUpi] = useState(null)
  const [card, setCard] = useState({ num: '', name: '', exp: '', cvv: '' })
  const [agree, setAgree] = useState(false)
  const min = p.minQty[tierIdx] || 1
  const total = unitPrice(p, t, annual) * qty
  const per = p.perMonth ? '/month' : annual ? '/year' : '/month'

  const fmtCard = v => {
    const d = v.replace(/\D/g, '').slice(0, 16)
    return d.match(/.{1,4}/g)?.join(' ') || d
  }
  const fmtExp = v => {
    const d = v.replace(/\D/g, '').slice(0, 4)
    return d.length >= 2 ? d.slice(0, 2) + '/' + d.slice(2) : d
  }
  const digits = card.num.replace(/\D/g, '')
  const preview = digits.padEnd(16, '•').replace(/(.{4})/g, '$1 ').trim()

  const go = () => {
    if (!agree) { window.alert('Please agree to the Terms of Service to continue.'); return }
    onSubmit()
  }

  return (
    <div className="step">
      <div className="cowrap">
        <div className="payfcard">
          <h2>Create your account</h2>
          <p className="sub">Your plan activates within 2 hours. No surprise costs — the price you see is what you pay.</p>

          <div className="qrow">
            <div className="qlbl">
              <strong>{p.unitLbl}</strong>
              <div style={{ fontSize: 11, color: 'var(--t3)', marginTop: 2 }}>Minimum {min}</div>
            </div>
            <div className="qctrl">
              <button className="qbtn" onClick={() => setQty(q => Math.max(min, q - 1))}>−</button>
              <div className="qval">{qty}</div>
              <button className="qbtn" onClick={() => setQty(q => q + 1)}>+</button>
            </div>
          </div>

          <div className="paytabs">
            <button className={`paytab ${pay === 'card' ? 'on' : ''}`} onClick={() => setPay('card')}>💳 Card</button>
            <button className={`paytab ${pay === 'upi' ? 'on' : ''}`} onClick={() => setPay('upi')}>📱 UPI</button>
            <button className={`paytab ${pay === 'nb' ? 'on' : ''}`} onClick={() => setPay('nb')}>🏦 Net Banking</button>
          </div>

          {pay === 'card' && (
            <div>
              <div className="cardprev">
                <div className="chip" />
                <div className="cdots">{preview}</div>
                <div className="cmeta">
                  <span>{card.name.toUpperCase() || 'CARDHOLDER NAME'}</span>
                  <span>{card.exp || 'MM/YY'}</span>
                </div>
              </div>
              <div className="field">
                <label>Card Number</label>
                <input value={card.num} maxLength={19} placeholder="1234 5678 9012 3456"
                  onChange={e => setCard(c => ({ ...c, num: fmtCard(e.target.value) }))} />
              </div>
              <div className="g2">
                <div className="field">
                  <label>Cardholder Name</label>
                  <input value={card.name} placeholder="RAJ KUMAR"
                    onChange={e => setCard(c => ({ ...c, name: e.target.value }))} />
                </div>
                <div className="g2" style={{ gap: 8 }}>
                  <div className="field">
                    <label>Expiry</label>
                    <input value={card.exp} maxLength={5} placeholder="MM/YY"
                      onChange={e => setCard(c => ({ ...c, exp: fmtExp(e.target.value) }))} />
                  </div>
                  <div className="field">
                    <label>CVV</label>
                    <input value={card.cvv} maxLength={4} placeholder="•••"
                      onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g, '') }))} />
                  </div>
                </div>
              </div>
              <div className="ssec">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="13" height="13">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                SSL secured · 256-bit encryption · PCI DSS compliant
              </div>
            </div>
          )}

          {pay === 'upi' && (
            <div className="upipanel">
              <p style={{ fontSize: 13, color: 'var(--t2)', marginBottom: 4 }}>Choose your UPI app</p>
              <div className="upiapps">
                {[['🟢', 'GPay'], ['🟣', 'PhonePe'], ['🔵', 'Paytm'], ['🟡', 'BHIM']].map(([ic, nm]) => (
                  <button key={nm} className={`upiapp ${upi === nm ? 'on' : ''}`} onClick={() => setUpi(nm)}>
                    <div className="upiapp-ic">{ic}</div>
                    <div className="upiapp-nm">{nm}</div>
                  </button>
                ))}
              </div>
              <div className="g2">
                <div className="field" style={{ marginBottom: 0 }}><input placeholder="yourname@upi" /></div>
                <button className="btn bo" style={{ padding: '11px 14px', fontSize: 13 }}>Verify</button>
              </div>
            </div>
          )}

          {pay === 'nb' && (
            <div className="field" style={{ marginTop: 6 }}>
              <label>Select Bank</label>
              <select>
                <option value="">Choose your bank</option>
                <option>State Bank of India</option><option>HDFC Bank</option><option>ICICI Bank</option>
                <option>Axis Bank</option><option>Kotak Mahindra Bank</option><option>Punjab National Bank</option>
                <option>Bank of Baroda</option><option>Other</option>
              </select>
            </div>
          )}

          <div className="terms">
            <input type="checkbox" id="nxg-terms" checked={agree} onChange={e => setAgree(e.target.checked)} />
            <label htmlFor="nxg-terms">
              I agree to the <span className="tlink">Terms of Service</span> and <span className="tlink">Privacy Policy</span>.
              I understand this is a subscription that renews automatically.
            </label>
          </div>
          <button className="btn bp bfull blg" onClick={go}>🔒 Complete Sign Up &amp; Pay</button>
          <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--t3)' }}>
            Confirmation email with licence key sent within minutes of payment.
          </div>
        </div>

        <div className="ordsum">
          <h3>Order Summary</h3>
          <div className="orl"><span className="orll"><ProdIcon icon={p.icon} /> {p.name} — {t.name}</span></div>
          <div className="orl"><span className="orll">Quantity ({p.unitLbl})</span><span className="orlv">{qty}</span></div>
          <div className="orl"><span className="orll">Unit price</span><span className="orlv">{fmtINR(t.price)}</span></div>
          <div className="orl">
            <span className="orll">Billing</span>
            <span className="orlv">{annual && !p.perMonth ? 'Annual' : 'Monthly'}</span>
          </div>
          {!p.perMonth && annual && (
            <div className="orl">
              <span className="orll" style={{ color: 'var(--g)' }}>Annual discount (20%)</span>
              <span className="orlv" style={{ color: 'var(--g)' }}>−{fmtINR(Math.round(t.price * qty * 0.2))}</span>
            </div>
          )}
          <div className="ordiv" />
          <div className="ortot">
            <div className="ortotl">Total</div>
            <div>
              <div className="ortotv">{fmtINR(total)}</div>
              <div className="orper">{per} · taxes extra</div>
            </div>
          </div>
          <div className="orbadges">
            <div className="obg obg-g">✓ Instant activation</div>
            <div className="obg obg-g">✓ 14-day money-back</div>
            <div className="obg obg-m">No setup fee</div>
            <div className="obg obg-m">Cancel anytime</div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: 960, marginTop: 14 }}>
        <button className="btn bgh" onClick={onBack}><ChevL /> Back to Plans</button>
      </div>
    </div>
  )
}

/* ══ STEP 4B — SALES / BUNDLE / POC ══════════════════════ */
function SalesForm({ mode, prods, t, onBack, onSubmit }) {
  const bundle = mode === 'bundle'
  const isPOC = !bundle && t?.action === 'enterprise'
  const icon = bundle ? '🎁' : isPOC ? '🔬' : '🤝'
  const title = bundle
    ? 'Let us build your custom bundle'
    : isPOC ? `Request a Guided POC — ${t.name}` : `Talk to our team — ${t.name}`

  return (
    <div className="step">
      <div className="scard">
        <div className="sico">{icon}</div>
        <h2>{title}</h2>
        <p className="sub">
          {bundle
            ? `You've selected ${prods.length} microservices. Our team will design a combined bundle with the best pricing and a single point of contact.`
            : isPOC
              ? `The ${t.name} tier includes a guided 30-day proof-of-concept with dedicated engineering support. Tell us about your requirements and a Solutions Engineer will design your POC plan.`
              : <>You've selected the <strong>{t.name}</strong> plan for {prods[0].name}. Tell us your requirements and we'll respond within 4 business hours.</>}
        </p>
        <div className="pills">
          {prods.map(p => (
            <div key={p.id} className="ppill"
              style={{ color: p.color, borderColor: `${p.color}40`, background: `${p.color}0d` }}>
              <ProdIcon icon={p.icon} /> {p.name}{!bundle && t ? ` — ${t.name}` : ''}
            </div>
          ))}
        </div>
        <div className="field">
          <label>What are you trying to achieve?</label>
          <textarea rows={4} placeholder="E.g. We need a VR training system for 50 drone operators across 3 locations, integrated with our existing LMS..." />
        </div>
        <div className="g2">
          <div className="field">
            <label>Expected go-live</label>
            <select>
              <option value="">Select timeline</option><option>Within 1 month</option><option>1–3 months</option>
              <option>3–6 months</option><option>6–12 months</option><option>Planning only</option>
            </select>
          </div>
          <div className="field">
            <label>Budget range (optional)</label>
            <select>
              <option value="">Prefer not to say</option><option>Under ₹5 lakhs</option><option>₹5–20 lakhs</option>
              <option>₹20–50 lakhs</option><option>₹50L – ₹1 crore</option><option>₹1 crore+</option><option>USD equivalent</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>How did you hear about us?</label>
          <select>
            <option value="">Select source</option><option>Google search</option><option>LinkedIn</option>
            <option>Referral</option><option>Defence / Govt tender</option><option>Trade show / event</option><option>Other</option>
          </select>
        </div>
        <button className="btn bp bfull blg" onClick={onSubmit} style={{ marginTop: 6 }}>Send to Sales Team →</button>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--t3)' }}>
          Our team personally reviews every inquiry. Expected response: &lt;4 business hours.
        </div>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn bgh" onClick={onBack}><ChevL /> Back</button>
        </div>
      </div>
    </div>
  )
}

/* ══ STEP 4C — FREE TRIAL ════════════════════════════════ */
function TrialForm({ p, t, onBack, onSubmit }) {
  return (
    <div className="step">
      <div className="scard">
        <div className="sico">🎯</div>
        <h2>Start Your 30-Day Free Trial — {t.name}</h2>
        <p className="sub">
          Full access to all <strong>{t.name}</strong> features for 30 days. No credit card required.
          A Solutions Engineer will contact you within 4 business hours to help you get the most from your trial.
        </p>
        <div className="pills">
          <div className="ppill" style={{ color: p.color, borderColor: `${p.color}40`, background: `${p.color}0d` }}>
            <ProdIcon icon={p.icon} /> {p.name} — {t.name}
          </div>
        </div>
        <div className="trial-box">
          <h4>What's included in your trial</h4>
          <p>Full access to all features in the {t.name} tier for 30 days.</p>
          <ul className="trial-feats">
            {t.feats.slice(0, 5).map(f => (
              <li key={f}><span style={{ color: 'var(--g)' }}>✓</span>&ensp;{f}</li>
            ))}
            {t.feats.length > 5 && (
              <li><span style={{ color: 'var(--t3)' }}>+</span>&ensp;{t.feats.length - 5} more included features</li>
            )}
          </ul>
        </div>
        <div className="field">
          <label>Primary Use Case</label>
          <textarea rows={3} placeholder="Tell us what you want to achieve during the trial — e.g. train 10 drone operators, run a proof-of-concept for the board, integrate with our existing LMS..." />
        </div>
        <div className="g2">
          <div className="field">
            <label>Number of {p.unitLbl}</label>
            <input type="number" placeholder="e.g. 14" />
          </div>
          <div className="field">
            <label>Current Training Method</label>
            <select>
              <option value="">Select current method</option><option>No formal training</option>
              <option>Classroom / instructor-led</option><option>eLearning / LMS</option>
              <option>Physical simulation</option><option>On-the-job training</option><option>Other</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>Preferred Trial Start</label>
          <select>
            <option value="">Select timing</option><option>Immediately</option><option>Within 1 week</option>
            <option>1–2 weeks from now</option><option>Next month</option>
          </select>
        </div>
        <button className="btn bp bfull blg" onClick={onSubmit} style={{ marginTop: 6 }}>Activate My Free Trial →</button>
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: 'var(--t3)' }}>
          No credit card required. No obligation. Cancel or convert anytime during or after trial.
        </div>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="btn bgh" onClick={onBack}><ChevL /> Back to Plans</button>
        </div>
      </div>
    </div>
  )
}

/* ══ STEP 5 — SUCCESS ════════════════════════════════════ */
function Success({ icon, tint, title, body, ref: refNo, next }) {
  return (
    <div className="step">
      <div className="sucwrap">
        <div className="sucico" style={{ background: `${tint}1a`, border: `2px solid ${tint}4d` }}>{icon}</div>
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="refl">Reference Number</div>
        <div className="refbox">{refNo}</div>
        <div className="sucstp">
          <h4>What happens next</h4>
          {next.map(([head, sub], i) => (
            <div className="nxst" key={head}>
              <div className="nxnum" style={i === 0 ? { background: `${tint}1a`, borderColor: `${tint}4d`, color: tint } : undefined}>
                {i + 1}
              </div>
              <div className="nxtxt"><strong>{head}</strong>{sub}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <button className="btn bp" onClick={() => window.location.reload()}>Start a New Enquiry</button>
          <button className="btn bgh" style={{ fontSize: 13 }} onClick={() => navigate('/')}>Return to Products</button>
        </div>
      </div>
    </div>
  )
}

/* ══ success payload builders ════════════════════════════ */
function paySuccess({ p, t, qty, customer, ref }) {
  return {
    icon: '🎉', tint: '#16a34a', ref,
    title: "Payment Confirmed — You're All Set!",
    body: <>Your <strong>{p.name} — {t.name}</strong> plan for <strong>{qty} {p.unitLbl}</strong> is now active.
      A receipt and your licence key have been sent to <strong>{customer.email}</strong>. Account configuration begins immediately.</>,
    next: [
      ['Receipt & licence key emailed', `Sent to ${customer.email} immediately`],
      ['Account configured (within 2 hours)', `Our team sets up your ${p.name} environment`],
      ['Onboarding call', 'A Customer Success Manager will schedule your kickoff session'],
      ['You go live', `Start using ${t.name} plan — all features active from day one`],
    ],
  }
}

function salesSuccess({ prods, isPOC, customer, ref }) {
  return {
    icon: isPOC ? '🔬' : '📨', tint: '#7c3aed', ref,
    title: isPOC ? 'POC Request Received' : 'Quote sent to our sales team',
    body: <>We've received your request for <strong>{prods.map(p => p.name).join(', ')}</strong>.
      Our team will review and reach out to <strong>{customer.email}</strong> within <strong>4 business hours</strong>.</>,
    next: [
      ['Confirmation emailed', `Your inquiry details sent to ${customer.email}`],
      ['Account Manager assigned (within 4 hours)', isPOC
        ? 'A Solutions Engineer reviews your POC requirements'
        : 'A dedicated Account Manager reviews your requirements'],
      [isPOC ? 'POC plan designed' : 'Custom proposal sent', isPOC
        ? '30-day POC scope and timeline prepared for your approval'
        : 'Tailored proposal with pricing, timeline, and next steps'],
      ['Discovery call', '30-minute call to align on scope, technical requirements, and timeline'],
    ],
  }
}

function trialSuccess({ p, t, customer, ref }) {
  return {
    icon: '🎯', tint: '#d97706', ref,
    title: 'Your 30-Day Free Trial is Being Activated!',
    body: <>Your trial of <strong>{p.name} — {t.name}</strong> is being set up. Full access to all {t.name} features
      for 30 days. Trial access details will be sent to <strong>{customer.email}</strong> within 2 hours.</>,
    next: [
      ['Trial environment created (within 2 hours)', `Your ${p.name} trial environment is being configured with full ${t.name} access`],
      ['Login credentials emailed', `Sent to ${customer.email} — check your inbox and spam folder`],
      ['Solutions Engineer assigned (within 4 hours)', 'A dedicated engineer will contact you to plan your trial and answer setup questions'],
      ['30 days full access', "Use every feature. At day 28 we'll check in — no pressure, convert or walk away"],
    ],
  }
}
