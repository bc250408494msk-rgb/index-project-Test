import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-blue-600">IndexMeNow</div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign In</Link>
          <Link href="/register" className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto text-center py-24 px-6">
        <h1 className="text-5xl font-bold text-gray-900 mb-6">Submit URLs. Get Indexed Faster.</h1>
        <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
          A professional tool that validates, submits, monitors, and retries your URLs across 6 independent indexing signals — with auto-refund if not indexed in 10 days.
        </p>
        <Link href="/register" className="bg-blue-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-700 inline-block">
          Get Started Free
        </Link>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-14">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              { step: "1", title: "Submit", desc: "Paste URLs or upload a CSV. We accept up to 500 URLs per batch." },
              { step: "2", title: "Health Check", desc: "We validate each URL is technically indexable before charging a credit." },
              { step: "3", title: "6 Signals", desc: "Google Indexing API, GSC Inspect, Sitemap, RSS/WebSub, IndexNow, Crawl Trigger — all fired in parallel." },
              { step: "4", title: "Monitor", desc: "Daily verification checks. Smart 7-day retry. Auto-refund after 10 days if not indexed." },
            ].map(({ step, title, desc }) => (
              <div key={step} className="text-center">
                <div className="w-12 h-12 rounded-full bg-blue-600 text-white text-xl font-bold flex items-center justify-center mx-auto mb-4">{step}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-600 text-sm">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-14">What Makes Us Different</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { icon: "🔍", title: "Check Before Charging", desc: "Health check catches unindexable URLs before wasting a credit." },
            { icon: "⚡", title: "6 Parallel Signals", desc: "Not sequential — all signals fire simultaneously for maximum speed." },
            { icon: "🧠", title: "Smart Retry", desc: "Re-diagnoses at day 7 before re-firing signals — not blind re-submission." },
            { icon: "✅", title: "Honest Verification", desc: "Uses official APIs, double-verifies before marking indexed." },
            { icon: "💳", title: "Auto-Refund", desc: "Credit automatically refunded if URL not indexed after 10 days." },
            { icon: "📊", title: "Full Observability", desc: "See exactly what happened for every signal and every check." },
          ].map(({ icon, title, desc }) => (
            <div key={title} className="p-6 border rounded-xl">
              <div className="text-3xl mb-3">{icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-gray-600 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-blue-600 py-16 text-center text-white px-6">
        <h2 className="text-3xl font-bold mb-4">Ready to get your pages indexed?</h2>
        <p className="mb-8 text-blue-100">Credits are assigned by your administrator. No payment required.</p>
        <Link href="/register" className="bg-white text-blue-600 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-blue-50 inline-block">
          Create Your Account
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-gray-500 text-sm">
        <p>© {new Date().getFullYear()} IndexMeNow. Built for SEO professionals.</p>
      </footer>
    </div>
  );
}
