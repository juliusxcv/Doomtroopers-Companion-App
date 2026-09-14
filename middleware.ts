import { next } from '@vercel/functions'

// Gates the whole site behind a single shared password, enforced at
// Vercel's edge before any HTML/JS/CSS is served — not a client-side check
// that could be bypassed by reading the JS bundle.
//
// Vercel's own built-in Password Protection would be the simpler option,
// but it's a paid add-on (not available on Hobby, and $150/mo even on Pro)
// — this is the standard free workaround, run as Vercel Routing Middleware
// (see https://vercel.com/docs/routing-middleware), which works the same
// for a plain static Vite build as it does for Next.js.
//
// Login is a normal HTTP Basic Auth prompt, but "remembering" it is NOT
// left to the browser's own (inconsistent, session-scoped-in-some-browsers)
// Basic Auth credential cache — on a correct password, a long-lived
// (1 year) HttpOnly cookie is set, and every later request is authenticated
// from that cookie instead, so the prompt should only ever appear once per
// browser. The cookie stores a SHA-256 hash of the password, not the
// password itself.
//
// The password lives in the SITE_PASSWORD environment variable (set in
// Vercel's project settings, not committed to the repo). Any username is
// accepted in the Basic Auth prompt — only the password is checked, same
// as how this app's own session join-codes work (trust-based, not real
// per-user accounts).
//
// If SITE_PASSWORD isn't set at all, this fails OPEN (site stays public)
// rather than bricking the deployment on a missing/misspelled env var —
// so after setting it in Vercel, redeploy and confirm the prompt actually
// appears before assuming the site is protected.

const COOKIE_NAME = 'dt_auth'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1 year

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return undefined
}

export default async function middleware(request: Request) {
  const password = process.env.SITE_PASSWORD
  if (!password) return next()

  const expected = await sha256Hex(password)

  const cookieHeader = request.headers.get('cookie') ?? ''
  if (readCookie(cookieHeader, COOKIE_NAME) === expected) return next()

  const auth = request.headers.get('authorization')
  if (auth?.startsWith('Basic ')) {
    const decoded = atob(auth.slice('Basic '.length))
    const suppliedPassword = decoded.slice(decoded.indexOf(':') + 1)
    if (suppliedPassword === password) {
      return next({
        headers: {
          'Set-Cookie': `${COOKIE_NAME}=${expected}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
        },
      })
    }
  }

  return new Response('Authentication required.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Doomtroopers Companion"' },
  })
}
