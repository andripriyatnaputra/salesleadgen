"use client";

import { useEffect, useState } from "react";
import { KebutuhanBadge, IndustriBadge } from "@/components/Badge";

interface RawLead {
  no: number;
  leadId: string;
  sumber: string;
  namaProyek: string;
  namaPerusahaan: string;
  urlTender: string;
  industri: string;
  lokasi: string;
  kebutuhan: string;
  nilaiProyek: number;
  deadline: string;
  status: string;
  deskripsi: string;
  createdAt: string;
  updatedAt: string;
}

function formatNilai(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "—";

  // Handle ISO date format (from database timestamp)
  if (dateStr.includes("T")) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  // Return as-is for Indonesian format like "12 Mei 2026"
  return dateStr;
}

export default function RawLeadsPage() {
  const [leads, setLeads] = useState<RawLead[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({
    source: "all",
    industri: "all",
    kebutuhan: "all",
  });

  useEffect(() => {
    async function loadLeads() {
      try {
        const res = await fetch("/api/raw-leads");
        if (res.ok) {
          const data = await res.json();
          setLeads(data.leads || []);
          setTotal(data.total || 0);
        }
      } catch (error) {
        console.error("Error loading leads:", error);
      } finally {
        setLoading(false);
      }
    }

    loadLeads();
  }, []);

  // Get unique values for filters
  const sources = ["all", ...new Set(leads.map(l => l.sumber))];
  const industries = ["all", ...new Set(leads.map(l => l.industri))];
  const categories = ["all", ...new Set(leads.map(l => l.kebutuhan))];

  // Apply filters
  const filteredLeads = leads.filter(lead => {
    if (filter.source !== "all" && lead.sumber !== filter.source) return false;
    if (filter.industri !== "all" && lead.industri !== filter.industri) return false;
    if (filter.kebutuhan !== "all" && lead.kebutuhan !== filter.kebutuhan) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Raw Leads</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Semua leads dari database ({filteredLeads.length} dari {total})
          </p>
        </div>
        <span className="bg-blue-100 text-blue-700 text-sm font-semibold px-3 py-1.5 rounded-full">
          {filteredLeads.length} leads
        </span>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4 flex gap-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Source</label>
          <select
            value={filter.source}
            onChange={(e) => setFilter({ ...filter, source: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {sources.map(s => (
              <option key={s} value={s}>{s === "all" ? "Semua" : s}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Industri</label>
          <select
            value={filter.industri}
            onChange={(e) => setFilter({ ...filter, industri: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {industries.map(i => (
              <option key={i} value={i}>{i === "all" ? "Semua" : i}</option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
          <select
            value={filter.kebutuhan}
            onChange={(e) => setFilter({ ...filter, kebutuhan: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(k => (
              <option key={k} value={k}>{k === "all" ? "Semua" : k}</option>
            ))}
          </select>
        </div>
      </div>

      {filteredLeads.length === 0 ? (
        <div className="text-center py-20 text-gray-400 bg-white rounded-lg border border-gray-200">
          <p className="text-lg">Belum ada data</p>
          <p className="text-sm mt-1">Jalankan agents untuk scraping leads</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-right w-10">#</th>
                  <th className="px-4 py-3 text-left">Source</th>
                  <th className="px-4 py-3 text-left">Nama Proyek</th>
                  <th className="px-4 py-3 text-left">Instansi</th>
                  <th className="px-4 py-3 text-left">Industri</th>
                  <th className="px-4 py-3 text-left">Kategori</th>
                  <th className="px-4 py-3 text-right">Nilai</th>
                  <th className="px-4 py-3 text-left">Deadline</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredLeads.map((lead, idx) => (
                  <tr key={lead.leadId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-right text-gray-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-1 bg-gray-100 text-gray-700 rounded">
                        {lead.sumber}
                      </span>
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {lead.urlTender ? (
                        <a
                          href={lead.urlTender}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium line-clamp-2 leading-snug"
                        >
                          {lead.namaProyek}
                        </a>
                      ) : (
                        <span className="font-medium line-clamp-2 leading-snug">{lead.namaProyek}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[180px]">
                      <span className="line-clamp-2 text-xs">{lead.namaPerusahaan}</span>
                    </td>
                    <td className="px-4 py-3">
                      <IndustriBadge value={lead.industri} />
                    </td>
                    <td className="px-4 py-3">
                      <KebutuhanBadge value={lead.kebutuhan} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700 whitespace-nowrap">
                      {formatNilai(lead.nilaiProyek)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(lead.deadline)}
                    </td>
                    <td className="px-4 py-3">
                      {lead.status ? (
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          lead.status.toLowerCase().includes("buka")
                            ? "bg-green-100 text-green-800"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {lead.status}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
