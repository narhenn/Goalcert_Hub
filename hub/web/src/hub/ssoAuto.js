// ssoAuto.js — bookkeeping for the sign-in auto-launch.
//
// Two facts have to outlive the component that learns them:
//
//   "launched"  so a page refresh, or React re-mounting the shell, does not
//               reopen the satellite app over and over. Cleared on sign-out by
//               being scoped to the user id.
//   "pending"   set when the browser blocked the pop-up. The shell reads it and
//               offers a button, because a click carries the user activation
//               that an automatic call did not have.
//
// sessionStorage, not localStorage: "already opened" is true for this tab's
// session only. A new window is a new sign-in and should open the app again.
const LAUNCHED = 'gc:sso:launched'
const PENDING = 'gc:sso:pending'

const read = k => { try { return sessionStorage.getItem(k) } catch { return null } }
const write = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v) } catch {} }

export const alreadyLaunched = userId => !!userId && read(LAUNCHED) === userId
export const markLaunched = userId => write(LAUNCHED, userId || '')
export const clearLaunched = () => write(LAUNCHED, null)

export function setPending(app, label) {
  write(PENDING, JSON.stringify({ app, label }))
  // The shell may already be mounted when this is set, so tell it rather than
  // relying on it to poll.
  try { window.dispatchEvent(new CustomEvent('sso:pending')) } catch {}
}

export function getPending() {
  const raw = read(PENDING)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function clearPending() {
  write(PENDING, null)
  try { window.dispatchEvent(new CustomEvent('sso:pending')) } catch {}
}
