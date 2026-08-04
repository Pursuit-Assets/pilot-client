import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';

/**
 * Returning & Deferred — the staff surface for the deferred pool (Phase 5 of the
 * deferral rework).
 *
 * Two groups, one place:
 *   Returning — applicants who reinstated a deferred application. They came back as
 *     PENDING, and the applicant-facing copy promised "someone from admissions will reach
 *     out" — this queue IS that promise. Worked needs_outreach → contacted → resolved.
 *   Deferred pool — everyone currently deferred (warm leads). Their applications carry no
 *     cohort and they appear in no cohort's numbers; this is where the connection stays warm.
 *
 * Contact info is front and center because the whole point is a phone call.
 * Data is fetched by AdmissionsDashboard (it also feeds the tab badge) and passed down.
 */

const STATUS_META = {
  needs_outreach: { label: 'Needs outreach', classes: 'bg-amber-100 text-amber-800 border-amber-300' },
  contacted: { label: 'Contacted', classes: 'bg-blue-100 text-blue-800 border-blue-300' },
  resolved: { label: 'Resolved', classes: 'bg-green-100 text-green-800 border-green-300' },
};

const priorDecisionChip = (status) => {
  if (status === 'accepted') {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-proxima-bold bg-green-100 text-green-700">was accepted</span>;
  }
  if (!status || status === 'pending') {
    return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-proxima bg-gray-100 text-gray-600">pending</span>;
  }
  return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-proxima bg-gray-100 text-gray-600">{status}</span>;
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

const ContactCell = ({ email, phone }) => (
  <div className="flex flex-col gap-0.5 min-w-0">
    <a href={`mailto:${email}`} className="text-sm text-[#4242ea] hover:underline truncate font-proxima" title={email}>
      {email}
    </a>
    {phone ? (
      <a href={`tel:${phone}`} className="text-sm text-gray-700 hover:underline font-proxima">
        📞 {phone}
      </a>
    ) : (
      <span className="text-xs text-gray-400 font-proxima">no phone on file</span>
    )}
  </div>
);

const ReturningTab = ({ token, data, loading, error, refetch }) => {
  const [savingId, setSavingId] = useState(null);
  const [saveError, setSaveError] = useState(null);

  const updateStatus = async (applicantId, status) => {
    setSavingId(applicantId);
    setSaveError(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/applicants/${applicantId}/reinstatement-status`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status }),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to update status');
      }
      await refetch();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-[#4242ea] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-proxima">Loading returning applicants...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <p className="text-red-600 font-proxima">{error}</p>
        <button onClick={refetch} className="text-sm text-[#4242ea] underline font-proxima">Retry</button>
      </div>
    );
  }

  const returning = data?.returning || [];
  const deferred = data?.deferred || [];

  return (
    <div className="space-y-6">
      {saveError && (
        <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-2 text-sm text-red-700 font-proxima">
          {saveError}
        </div>
      )}

      {/* ---- Returning queue ---- */}
      <Card className="bg-white border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#1a1a1a] font-proxima-bold">
            Returning — reinstated applications
          </CardTitle>
          <p className="text-sm text-gray-500 font-proxima">
            These applicants paused their application and came back. They re-entered as <b>pending</b> and
            were told someone from admissions will reach out — call them to confirm their plans, then move
            them through Needs outreach → Contacted → Resolved.
          </p>
        </CardHeader>
        <CardContent>
          {returning.length === 0 ? (
            <p className="text-sm text-gray-400 font-proxima py-4">
              No one has reinstated an application yet. When someone does, they land here automatically.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-proxima border-collapse">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <th className="py-2 px-3">Applicant</th>
                    <th className="py-2 px-3">Contact</th>
                    <th className="py-2 px-3">Rejoining</th>
                    <th className="py-2 px-3">Paused from</th>
                    <th className="py-2 px-3">Prior decision</th>
                    <th className="py-2 px-3">Outreach status</th>
                  </tr>
                </thead>
                <tbody>
                  {returning.map((r) => (
                    <tr key={r.applicant_id} className="border-b border-gray-100 align-top">
                      <td className="py-2.5 px-3">
                        <div className="font-proxima-bold text-[#1a1a1a]">{r.name}</div>
                        <div className="text-xs text-gray-500">reinstated {fmtDate(r.reinstated_at)}</div>
                      </td>
                      <td className="py-2.5 px-3"><ContactCell email={r.email} phone={r.phone} /></td>
                      <td className="py-2.5 px-3 text-gray-700">{r.reinstated_cohort || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-700">
                        {r.deferred_from_cohort || '—'}
                        <div className="text-xs text-gray-400">paused {fmtDate(r.deferred_at)}</div>
                      </td>
                      <td className="py-2.5 px-3">{priorDecisionChip(r.reinstated_from_admission_status)}</td>
                      <td className="py-2.5 px-3">
                        <select
                          value={r.reinstatement_status}
                          disabled={savingId === r.applicant_id}
                          onChange={(e) => updateStatus(r.applicant_id, e.target.value)}
                          className={`text-xs font-proxima-bold rounded-full border px-2 py-1 cursor-pointer ${STATUS_META[r.reinstatement_status]?.classes || ''}`}
                        >
                          {Object.entries(STATUS_META).map(([value, meta]) => (
                            <option key={value} value={value}>{meta.label}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Deferred pool ---- */}
      <Card className="bg-white border border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-[#1a1a1a] font-proxima-bold">
            Deferred pool — warm leads
          </CardTitle>
          <p className="text-sm text-gray-500 font-proxima">
            Everyone currently deferred. They belong to no cohort and count in no cohort's numbers until
            they reinstate. Keep the connection warm — they already told us they're interested.
          </p>
        </CardHeader>
        <CardContent>
          {deferred.length === 0 ? (
            <p className="text-sm text-gray-400 font-proxima py-4">The deferred pool is empty.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-proxima border-collapse">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <th className="py-2 px-3">Applicant</th>
                    <th className="py-2 px-3">Contact</th>
                    <th className="py-2 px-3">Deferred from</th>
                    <th className="py-2 px-3">Deferred on</th>
                    <th className="py-2 px-3">Prior decision</th>
                    <th className="py-2 px-3">Pledge</th>
                  </tr>
                </thead>
                <tbody>
                  {deferred.map((r) => (
                    <tr key={r.applicant_id} className="border-b border-gray-100 align-top">
                      <td className="py-2.5 px-3 font-proxima-bold text-[#1a1a1a]">{r.name}</td>
                      <td className="py-2.5 px-3"><ContactCell email={r.email} phone={r.phone} /></td>
                      <td className="py-2.5 px-3 text-gray-700">{r.deferred_from_cohort || '—'}</td>
                      <td className="py-2.5 px-3 text-gray-700">{fmtDate(r.deferred_at)}</td>
                      <td className="py-2.5 px-3">{priorDecisionChip(r.program_admission_status)}</td>
                      <td className="py-2.5 px-3 text-gray-700">{r.pledge_completed ? '✓ signed' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReturningTab;
