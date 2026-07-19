import Link from 'next/link'
import { auth } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await auth()

  return (
    <main className="min-h-screen bg-white flex flex-col items-center">
      <div className="w-full max-w-4xl px-8 flex flex-col flex-1">

        {/* ── Navbar ── */}
        <nav className="flex items-center justify-between h-14 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
              <rect width="26" height="26" rx="7" fill="#2563eb" />
              <polyline points="7,17 11,12 14,15 19,9" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span className="font-bold text-[16px] tracking-tight text-slate-900">JobPilot</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="text-[13px] font-medium text-gray-600 hover:text-gray-900 transition-colors">
              Sign in
            </Link>
            <Link href="/auth?tab=register" className="text-[13px] font-semibold bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
              Get started
            </Link>
          </div>
        </nav>

        {/* ── Hero ── */}
        <div className="flex-1 flex flex-col items-center justify-center text-center py-24">
          <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-[12px] font-semibold px-3 py-1.5 rounded-full mb-8 border border-blue-100">
            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full inline-block" />
            Free to use · No credit card required
          </div>

          <h1 className="text-5xl font-bold text-slate-900 tracking-tight max-w-2xl leading-tight mb-6">
            Track every job application,{' '}
            <span className="text-blue-600">without the spreadsheet.</span>
          </h1>

          <p className="text-lg text-black max-w-xl mb-10 leading-relaxed">
            JobPilot keeps your job search organized. Add jobs from GitHub
            or anywhere else — see your pipeline at a glance and never lose track of where you stand.
          </p>

          <div className="flex items-center gap-4 flex-wrap justify-center">
            <Link href="/auth?tab=register" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-8 py-3.5 rounded-xl text-[15px] transition-colors shadow-sm">
              Start tracking for free
            </Link>
            <Link href="/auth" className="text-[14px] font-medium text-gray-500 hover:text-gray-700 transition-colors">
              Already have an account →
            </Link>
          </div>
        </div>
      </div>
    </main>
  )
}
