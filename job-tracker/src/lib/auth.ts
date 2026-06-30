import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { users } from '@/db/schema'

// Extend Auth.js types so session.user.id is always a string
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      image: string | null
    }
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [GitHub],

  // JWT strategy (no adapter) — keeps schema simple.
  // Auth.js default is JWT when no adapter is set.
  session: { strategy: 'jwt' },

  callbacks: {
    // Runs on every sign-in and every subsequent request.
    // `account` is only present on the first sign-in for a session.
    async jwt({ token, account }) {
      if (account) {
        // First sign-in: find or create our users table row.
        const existing = await db.query.users.findFirst({
          where: eq(users.email, token.email!),
        })
        if (existing) {
          token.userId = existing.id
        } else {
          const newId = crypto.randomUUID()
          await db.insert(users).values({
            id    : newId,
            email : token.email!,
            name  : token.name  ?? null,
            image : token.picture ?? null,
          })
          token.userId = newId
        }
      }
      return token
    },

    // Shape the session object that client components receive.
    async session({ session, token }) {
      session.user.id = token.userId as string
      return session
    },
  },
})

// Single function that route handlers call to get the current user.
// Easy to vi.mock in tests without touching next-auth internals.
export async function getCurrentUser(): Promise<{
  id: string
  email: string
  name: string | null
  image: string | null
} | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id    : session.user.id,
    email : session.user.email,
    name  : session.user.name  ?? null,
    image : session.user.image ?? null,
  }
}
