export const dynamic = "force-dynamic";

import { getOutreach } from "@/lib/data";
import { KebutuhanBadge, IndustriBadge, ScoreBadge } from "@/components/Badge";
import { EmailButton } from "@/components/EmailModal";

function formatNilai(n: number): string {
  if (!n) return "—";
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}M`;
  if (n >= 1_000_000)     return `Rp ${(n / 1_000_000).toFixed(0)}jt`;
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function ScoreBar({ breakdown }: { breakdown: { nilai: number; maks: number; label: string } }) {
  const pct = Math.round((breakdown.nilai / breakdown.maks) * 100);
  return (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <div className="w-16 bg-gray-200 rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span>{breakdown.nilai}/{breakdown.maks}</span>
    </div>
  );
}

export default function OutreachPage() {
  const data = getOutreach();
  const leads = data.leads;

  const qualified = leads.filter((l) => l.isQualified).length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Outreach</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Lead dengan ICP scoring + draft email
            {data.modelDigunakan && (
              <span className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-500">
                {data.modelDigunakan}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3 text-sm">
          <span className="bg-green-100 text-green-800 font-semibold px-3 py-1.5 rounded-full">
            {qualified} qualified
          </span>
          <span className="bg-gray-100 text-gray-700 font-semibold px-3 py-1.5 rounded-full">
            {data.totalLeads} total
          </span>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">Belum ada data</p>
          <p className="text-sm mt-1">Jalankan pipeline: <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">npx tsx src/index.ts</code></p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left">Nama Proyek</th>
                  <th className="px-4 py-3 text-left">Instansi</th>
                  <th className="px-4 py-3 text-left">Industri</th>
                  <th className="px-4 py-3 text-left">Kategori</th>
                  <th className="px-4 py-3 text-right">Nilai</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-left">Breakdown</th>
                  <th className="px-4 py-3 text-center">Email</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leads.map((lead) => (
                  <tr
                    key={lead.leadId}
                    className={`hover:bg-gray-50 transition-colors ${lead.isQualified ? "bg-green-50/40" : ""}`}
                  >
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
                    <td className="px-4 py-3 max-w-[160px]">
                      <span className="text-xs text-gray-700 line-clamp-2">{lead.namaPerusahaan}</span>
                      {lead.lokasi && (
                        <span className="text-xs text-gray-400 block">{lead.lokasi}</span>
                      )}
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
                    <td className="px-4 py-3 text-center">
                      <ScoreBadge score={lead.score} qualified={lead.isQualified} />
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="space-y-1">
                        <ScoreBar breakdown={lead.scoreBreakdown.industri} />
                        <ScoreBar breakdown={lead.scoreBreakdown.lokasi} />
                        <ScoreBar breakdown={lead.scoreBreakdown.nilaiProyek} />
                        <ScoreBar breakdown={lead.scoreBreakdown.timing} />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <EmailButton email={lead.email} instansi={lead.namaPerusahaan} />
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
