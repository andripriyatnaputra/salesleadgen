import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starcom LeadGen",
  description: "Dashboard lead generation PT Starcom Solusindo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-screen-2xl mx-auto px-6 flex items-center gap-8 h-14">
            <Link href="/" className="font-bold text-blue-700 text-lg tracking-tight hover:text-blue-800 transition-colors">
              Starcom LeadGen
            </Link>
            <nav className="flex gap-1">
              <Link
                href="/"
                className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Home
              </Link>
              <Link
                href="/dashboard"
                className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Run Agents
              </Link>
              <Link
                href="/raw-leads"
                className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Raw Leads
              </Link>
              <Link
                href="/outreach"
                className="px-4 py-1.5 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              >
                Outreach
              </Link>
            </nav>
          </div>
        </header>
        <main className="max-w-screen-2xl mx-auto px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
