import NextAuth from 'next-auth'
import GitHub from 'next-auth/providers/github'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
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
  providers: [
    GitHub,
    Google,

    // Credentials handles email + password sign-in.
    // Unlike OAuth providers, it calls `authorize` directly — no browser redirect.
    // Return a user object → session created. Return null → sign-in fails.
    Credentials({
      credentials: {
        email    : { label: 'Email',    type: 'email'    },
        password : { label: 'Password', type: 'password' },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const email    = credentials.email    as string
        const password = credentials.password as string

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        })

        // No user found, or user signed up via OAuth (no password set)
        if (!user || !user.password) return null

        // compare() takes the plain-text input and the stored hash.
        // bcryptjs extracts the salt from the hash automatically.
        // NEVER compare plain text directly — the hash will never match.
        const valid = await compare(password, user.password)
        if (!valid) return null

        return {
          id    : user.id,
          email : user.email,
          name  : user.name  ?? null,
          image : user.image ?? null,
        }
      },
    }),
  ],

  // JWT strategy: sessions are stored in a signed cookie, not the database.
  // This means no session table is needed — the JWT holds everything.
  session: { strategy: 'jwt' },

  // Tell Auth.js to use our custom page instead of its built-in sign-in UI.
  // When an unauthenticated user hits a protected route, they go to /auth.
  pages: {
    signIn: '/auth',
  },

  callbacks: {
    // jwt() runs on every sign-in and on every request that reads the session.
    // `account` is only present on the first sign-in — that's when we write to the DB.
    async jwt({ token, account, user }) {
      if (account) {
        if (account.type === 'credentials') {
          // Credentials: user was already inserted during registration.
          // The `user` object here is what `authorize()` returned above.
          token.userId = (user as { id: string }).id
        } else {
          // OAuth (GitHub / Google): find or create the user row.
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
              // password stays null for OAuth users — they authenticate via their provider
            })
            token.userId = newId
          }
        }
      }
      return token
    },

    // session() shapes what client components receive via useSession() / auth().
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
