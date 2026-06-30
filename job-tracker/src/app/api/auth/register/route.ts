// Why this is a separate route from Auth.js:
// Auth.js's job is to mint session cookies. Our job here is to create the user row.
// Separating them keeps each piece small and testable.
//
// Flow: POST /api/auth/register → validate → hash → insert → return { ok: true }
// Then the client immediately calls signIn('credentials') to get the session cookie.

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { hash } from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'

const registerSchema = z.object({
  name     : z.string().min(1, 'Name is required').max(100),
  email    : z.string().email('Invalid email address'),
  password : z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // safeParse never throws — it returns { success, data } or { success, error }
  const result = registerSchema.safeParse(body)
  if (!result.success) {
    return Response.json(
      { error: result.error.flatten().fieldErrors },
      { status: 400 }
    )
  }

  const { name, email, password } = result.data

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  if (existing) {
    return Response.json(
      { error: { email: ['An account with this email already exists'] } },
      { status: 409 }
    )
  }

  // Why 12 salt rounds: bcrypt is intentionally slow. 2^12 = 4096 iterations
  // per hash attempt. This makes brute-forcing a stolen database very expensive.
  const passwordHash = await hash(password, 12)

  await db.insert(users).values({
    id       : crypto.randomUUID(),
    email,
    name,
    password : passwordHash,
  })

  return Response.json({ ok: true }, { status: 201 })
}
