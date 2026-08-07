import React, { useState, useEffect, useCallback } from 'react';
import useAuthStore from '../../../../stores/authStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../../../../components/ui/tabs';
import SyncStatusBar from './SyncStatusBar';
import CohortKpis from './CohortKpis';
import AlumniList from './AlumniList';
import EmployersTable from './EmployersTable';
import AlumniDetailModal from './AlumniDetailModal';
import SalaryAnalysis from './SalaryAnalysis';

const API = import.meta.env.VITE_API_URL;

const EMPTY_ALUMNI = { data: [], total: 0, limit: 500, offset: 0 };

const JobOutcomesTab = () => {
  const token = useAuthStore((s) => s.token);

  const [cohort, setCohort] = useState('all');
  const [cohorts, setCohorts] = useState([]);
  const [overview, setOverview] = useState(null);
  const [alumni, setAlumni] = useState(EMPTY_ALUMNI);
  const [employers, setEmployers] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const authHeaders = { Authorization: `Bearer ${token}` };

  const fetchAll = useCallback(async (cohortValue) => {
    // Everything on this page comes from the API. There is deliberately no bundled
    // fallback: this data is alumni salaries and bond invoice amounts, and the version
    // that used to ship as a JS fixture put all of it in the browser bundle and in every
    // clone of the repo. An outage here shows an error, not a stale copy of real records.
    setIsLoading(true);
    setError('');
    const cohortParam = cohortValue && cohortValue !== 'all' ? `?cohort=${encodeURIComponent(cohortValue)}` : '';

    try {
      const [overviewRes, alumniRes, employersRes, cohortsRes, syncRes] = await Promise.all([
        fetch(`${API}/api/job-outcomes/overview${cohortParam}`, { headers: authHeaders }),
        fetch(`${API}/api/job-outcomes/alumni${cohortParam}${cohortParam ? '&' : '?'}limit=500`, { headers: authHeaders }),
        fetch(`${API}/api/job-outcomes/employers${cohortParam}`, { headers: authHeaders }),
        fetch(`${API}/api/job-outcomes/cohorts`, { headers: authHeaders }),
        fetch(`${API}/api/job-outcomes/sync/status`, { headers: authHeaders }),
      ]);

      const failed = [overviewRes, alumniRes, employersRes, cohortsRes, syncRes].find((r) => !r.ok);
      if (failed) throw new Error(`HTTP ${failed.status}`);

      setOverview(await overviewRes.json());
      setAlumni(await alumniRes.json());
      setEmployers(await employersRes.json());
      setCohorts(await cohortsRes.json());
      setSyncStatus(await syncRes.json());
    } catch (e) {
      console.error('Job outcomes fetch failed:', e);
      setError(e.message || 'Failed to load job outcomes');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAll(cohort);
  }, [fetchAll, cohort]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${API}/api/job-outcomes/sync`, { method: 'POST', headers: authHeaders });
      if (res.status === 503) {
        setNotice('Salesforce sync isn’t enabled yet. Once a Salesforce Connected App is provisioned and SF credentials are set in the backend env, this button will pull the latest data.');
      } else if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      } else {
        // After triggering, poll status briefly so the bar updates.
        await new Promise(r => setTimeout(r, 1500));
        await fetchAll(cohort);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Job Outcomes</h2>
          <p className="text-sm text-gray-500 mt-1">
            Alumni employment and bond invoicing data
          </p>
        </div>
        <Select value={cohort} onValueChange={setCohort}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="All cohorts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cohorts</SelectItem>
            {cohorts.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <SyncStatusBar
        syncStatus={syncStatus}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {notice && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
          <span className="font-medium">Heads up:</span>
          <span>{notice}</span>
        </div>
      )}

      {isLoading && (
        <div className="py-12 text-center text-gray-500 text-sm">Loading job outcomes…</div>
      )}

      {!isLoading && !error && !overview?.totalAlumni && (
        <div className="py-12 text-center text-gray-500 text-sm">
          No alumni outcomes recorded yet.
        </div>
      )}

      {!isLoading && !error && !!overview?.totalAlumni && (
        <Tabs defaultValue="kpis" className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-3xl">
            <TabsTrigger value="kpis">Overview</TabsTrigger>
            <TabsTrigger value="alumni">Alumni</TabsTrigger>
            <TabsTrigger value="employers">Employers</TabsTrigger>
            <TabsTrigger value="salary">Salary Analysis</TabsTrigger>
          </TabsList>

          <TabsContent value="kpis" className="mt-6">
            <CohortKpis overview={overview} />
          </TabsContent>

          <TabsContent value="alumni" className="mt-6">
            <AlumniList
              alumni={alumni}
              onSelect={(a) => setSelectedContactId(a.salesforce_contact_id)}
            />
          </TabsContent>

          <TabsContent value="employers" className="mt-6">
            <EmployersTable employers={employers} />
          </TabsContent>

          <TabsContent value="salary" className="mt-6">
            <SalaryAnalysis cohort={cohort} />
          </TabsContent>
        </Tabs>
      )}

      <AlumniDetailModal
        contactId={selectedContactId}
        open={!!selectedContactId}
        onClose={() => setSelectedContactId(null)}
      />
    </div>
  );
};

export default JobOutcomesTab;
