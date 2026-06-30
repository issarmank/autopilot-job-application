// Why split into server + client?
// auth() reads cookies, which only works in Server Components.
// But the form (with useState, event handlers) requires a Client Component.
// Pattern: server component does the auth check, then renders the client UI.

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import AuthClient from './AuthClient'

export const dynamic = 'force-dynamic'

export default async function AuthPage() {
  const session = await auth()
  // Already logged in — no reason to show the auth page
  if (session?.user?.id) redirect('/dashboard')

  // Suspense is required here because AuthClient calls useSearchParams().
  // Next.js suspends during SSR for components that read search params,
  // so a fallback prevents the whole page from failing.
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <AuthClient />
    </Suspense>
  )
}
