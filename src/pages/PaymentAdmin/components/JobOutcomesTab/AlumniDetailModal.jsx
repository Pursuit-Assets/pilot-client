import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../../components/ui/dialog';
import { Card, CardContent } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import useAuthStore from '../../../../stores/authStore';
import { Briefcase, CheckCircle, TrendingUp, DollarSign } from 'lucide-react';

const formatCurrency = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};
const formatDate = (iso) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const AlumniDetailModal = ({ contactId, open, onClose }) => {
  const token = useAuthStore((s) => s.token);
  const [detail, setDetail] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !contactId) {
      setDetail(null);
      return;
    }
    setIsLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_API_URL}/api/job-outcomes/alumni/${encodeURIComponent(contactId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(setDetail)
      .catch(e => setError(e.message))
      .finally(() => setIsLoading(false));
  }, [open, contactId, token]);

  const outcome = detail?.outcome;
  const affiliations = detail?.affiliations || [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {outcome ? `${outcome.first_name} ${outcome.last_name}` : 'Loading…'}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="py-12 text-center text-gray-500">Loading…</div>}
        {error && <div className="py-4 text-red-600 text-sm">Error: {error}</div>}

        {outcome && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">Cohort</div>
                    <div className="text-sm font-medium mt-1">{outcome.cohort || outcome.core_cohort || '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{outcome.core_stack}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">Time to First Job</div>
                    <div className="text-sm font-medium mt-1">
                      {outcome.weeks_to_first_job != null ? `${Number(outcome.weeks_to_first_job).toFixed(1)} weeks` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">Current Salary</div>
                    <div className="text-sm font-medium mt-1">{formatCurrency(outcome.current_salary)}</div>
                    {outcome.salary_diff != null && (
                      <div className="text-xs text-green-600 mt-0.5">+{formatCurrency(outcome.salary_diff)} lift</div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">Jobs Held</div>
                    <div className="text-sm font-medium mt-1">
                      {outcome.num_jobs_held ?? 0}
                      {outcome.num_current_jobs > 0 && (
                        <span className="text-xs text-gray-500 ml-1">({outcome.num_current_jobs} current)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  {outcome.hired_within_3mo && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Hired ≤ 3mo</Badge>
                  )}
                  {outcome.hired_within_6mo && !outcome.hired_within_3mo && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Hired ≤ 6mo</Badge>
                  )}
                  {outcome.hired_within_1yr && !outcome.hired_within_6mo && (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Hired ≤ 1yr</Badge>
                  )}
                  {outcome.isa_eligible && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">ISA Eligible</Badge>
                  )}
                  {outcome.isa_complete && (
                    <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">ISA Complete</Badge>
                  )}
                  {outcome.outcomes_status && (
                    <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
                      {outcome.outcomes_status}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Employment History</h3>
              {affiliations.length === 0 ? (
                <p className="text-sm text-gray-500">No employment records on file.</p>
              ) : (
                <div className="space-y-3">
                  {affiliations.map((aff) => (
                    <Card key={aff.salesforce_affiliation_id}>
                      <CardContent className="pt-5 pb-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Briefcase className="h-4 w-4 text-gray-500" />
                              <span className="font-semibold">{aff.employer_name || 'Unknown employer'}</span>
                              {aff.status === 'Current' && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">Current</Badge>
                              )}
                            </div>
                            <div className="text-sm text-gray-700 mt-1">{aff.role_title || '—'}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {formatDate(aff.start_date)} – {aff.end_date ? formatDate(aff.end_date) : 'Present'}
                              {aff.location && ` • ${aff.location}`}
                            </div>

                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {aff.is_pursuit_impacted && (
                                <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 text-xs">
                                  Pursuit-Impacted
                                </Badge>
                              )}
                              {aff.pursuit_facilitated && (
                                <Badge variant="outline" className="bg-pink-50 text-pink-700 border-pink-200 text-xs">
                                  Pursuit-Facilitated
                                </Badge>
                              )}
                              {aff.is_promotion && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                                  <TrendingUp className="h-3 w-3 mr-0.5" />Promotion
                                </Badge>
                              )}
                              {aff.converted_temp_to_ft && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                                  Temp → FT
                                </Badge>
                              )}
                              {aff.has_equity && (
                                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">
                                  <DollarSign className="h-3 w-3 mr-0.5" />Equity
                                </Badge>
                              )}
                              {aff.job_info_confirmed && (
                                <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200 text-xs">
                                  <CheckCircle className="h-3 w-3 mr-0.5" />Confirmed
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">Salary</div>
                            <div className="text-base font-semibold tabular-nums mt-0.5">
                              {formatCurrency(aff.annualized_salary)}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AlumniDetailModal;
