import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import Internships from '@/components/Internships'

// force-dynamic is required because auth() reads a cookie from the request —
// see src/app/dashboard/page.tsx for the same pattern.
export const dynamic = 'force-dynamic'

export default async function InternshipsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/auth')

  return <Internships />
}
