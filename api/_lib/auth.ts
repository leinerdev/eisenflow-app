import type { VercelRequest } from '@vercel/node'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { getEnv } from './env.js'

const SESSION_COOKIE = 'eisenflow_session'
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30

type SessionPayload = {
  scope: 'eisenflow'
  exp: number
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {}
  }

  return cookieHeader.split(';').reduce<Record<string, string>>((cookies, part) => {
    const [name, ...valueParts] = part.trim().split('=')
    if (!name || valueParts.length === 0) {
      return cookies
    }

    cookies[name] = decodeURIComponent(valueParts.join('='))
    return cookies
  }, {})
}

function createSignature(payload: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(payload).digest()
}

function serializeCookie(name: string, value: string, clear: boolean): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    clear ? 'Max-Age=0' : `Max-Age=${SESSION_DURATION_SECONDS}`,
  ]

  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure')
  }

  return attributes.join('; ')
}

function getSessionSecret(): string {
  return getEnv('EISENFLOW_SESSION_SECRET')
}

export function isPasswordValid(candidate: string): boolean {
  const expected = getEnv('EISENFLOW_APP_PASSWORD')
  const candidateDigest = createHash('sha256').update(candidate).digest()
  const expectedDigest = createHash('sha256').update(expected).digest()
  return timingSafeEqual(candidateDigest, expectedDigest)
}

export function createSessionCookie(): string {
  const payload: SessionPayload = {
    scope: 'eisenflow',
    exp: Date.now() + SESSION_DURATION_SECONDS * 1000,
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = createSignature(encodedPayload, getSessionSecret()).toString('base64url')
  return serializeCookie(SESSION_COOKIE, `${encodedPayload}.${signature}`, false)
}

export function clearSessionCookie(): string {
  return serializeCookie(SESSION_COOKIE, '', true)
}

export function isAuthenticated(req: VercelRequest): boolean {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  if (!token) {
    return false
  }

  const [encodedPayload, signature] = token.split('.')
  if (!encodedPayload || !signature) {
    return false
  }

  try {
    const expectedSignature = createSignature(encodedPayload, getSessionSecret())
    const providedSignature = Buffer.from(signature, 'base64url')
    if (providedSignature.length !== expectedSignature.length) {
      return false
    }

    if (!timingSafeEqual(providedSignature, expectedSignature)) {
      return false
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as SessionPayload
    return payload.scope === 'eisenflow' && payload.exp > Date.now()
  } catch {
    return false
  }
}
