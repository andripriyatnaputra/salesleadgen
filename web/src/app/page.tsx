"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LeadStats {
  total: number;
  bySource: Record<string, number>;
  byIndustry: Record<string, number>;
  byCategory: Record<string, number>;
  totalValue: number;
}

export default function Home() {
  const [stats, setStats] = useState<LeadStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/stats");
        if (res.ok) {
          const data = await res.json();

          const bySource: Record<string, number> = {};
          const byIndustry: Record<string, number> = {};
          const byCategory: Record<string, number> = {};
          let totalValue = 0;

          data.leads?.forEach((lead: any) => {
            // Count by source
            const source = lead.sumber || lead.deskripsi?.split("|")[0]?.trim() || "Unknown";
            bySource[source] = (bySource[source] || 0) + 1;

            // Count by industry
            byIndustry[lead.industri] = (byIndustry[lead.industri] || 0) + 1;

            // Count by category
            byCategory[lead.kebutuhan] = (byCategory[lead.kebutuhan] || 0) + 1;

            // Sum total value (handle string from BIGINT)
            const nilai = typeof lead.nilaiProyek === 'string'
              ? parseInt(lead.nilaiProyek, 10)
              : (lead.nilaiProyek || 0);
            totalValue += nilai;
          });

          setStats({
            total: data.total || 0,
            bySource,
            byIndustry,
            byCategory,
            totalValue,
          });
        }
      } catch (error) {
        console.error("Error loading stats:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading stats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Starcom LeadGen Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Sistem lead generation otomatis untuk PT Starcom Solusindo
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Leads</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{stats?.total || 0}</p>
            </div>
            <div className="bg-blue-100 rounded-full p-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Nilai</p>
              <p className="text-2xl font-bold text-gray-900 mt-2">
                {(() => {
                  const total = stats?.totalValue || 0;
                  if (total >= 1_000_000_000_000) {
                    return `Rp ${(total / 1_000_000_000_000).toFixed(1)} T`;
                  } else if (total >= 1_000_000_000) {
                    return `Rp ${(total / 1_000_000_000).toFixed(1)} M`;
                  } else if (total >= 1_000_000) {
                    return `Rp ${(total / 1_000_000).toFixed(0)} jt`;
                  }
                  return new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    maximumFractionDigits: 0,
                  }).format(total);
                })()}
              </p>
            </div>
            <div className="bg-green-100 rounded-full p-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sources</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {Object.keys(stats?.bySource || {}).length}
              </p>
            </div>
            <div className="bg-purple-100 rounded-full p-3">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Industries</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {Object.keys(stats?.byIndustry || {}).length}
              </p>
            </div>
            <div className="bg-orange-100 rounded-full p-3">
              <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Link
          href="/dashboard"
          className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow p-6 transition-all"
        >
          <h3 className="font-semibold text-lg mb-2">🚀 Run Agents</h3>
          <p className="text-blue-100 text-sm">Jalankan scraping & processing agents</p>
        </Link>

        <Link
          href="/raw-leads"
          className="bg-white hover:bg-gray-50 rounded-lg shadow p-6 border border-gray-200 transition-all"
        >
          <h3 className="font-semibold text-lg mb-2 text-gray-900">📊 View Raw Leads</h3>
          <p className="text-gray-600 text-sm">Lihat semua leads yang sudah di-scrape</p>
        </Link>

        <Link
          href="/outreach"
          className="bg-white hover:bg-gray-50 rounded-lg shadow p-6 border border-gray-200 transition-all"
        >
          <h3 className="font-semibold text-lg mb-2 text-gray-900">✉️ Outreach Emails</h3>
          <p className="text-gray-600 text-sm">Draft email untuk qualified leads</p>
        </Link>
      </div>

      {/* Breakdown Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* By Industry */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Leads by Industry</h3>
          <div className="space-y-3">
            {Object.entries(stats?.byIndustry || {})
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([industry, count]) => (
                <div key={industry}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700">{industry}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${(count / (stats?.total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* By Category */}
        <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-4">Leads by Category</h3>
          <div className="space-y-3">
            {Object.entries(stats?.byCategory || {})
              .sort(([, a], [, b]) => b - a)
              .slice(0, 5)
              .map(([category, count]) => (
                <div key={category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 capitalize">{category}</span>
                    <span className="font-medium text-gray-900">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full"
                      style={{ width: `${(count / (stats?.total || 1)) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
