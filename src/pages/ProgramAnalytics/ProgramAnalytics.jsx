import React, { useState, useEffect } from 'react';
import useAuthStore from '../../stores/authStore';
import useNavStore from '../../stores/navStore';
import ProgramMetricsTab from '../AdminDashboard/tabs/ProgramMetricsTab';
import CohortComparisonTab from '../AdminDashboard/tabs/CohortComparisonTab';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7001';

const SUBTABS = [
  { id: 'program-performance', label: 'Program Performance' },
  { id: 'cohort-performance',  label: 'Cohort Performance' },
];

const TAB_BASE = 'px-5 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap';
const TAB_ACTIVE = 'border-[#4242EA] text-[#4242EA]';
const TAB_INACTIVE = 'border-transparent text-slate-500 hover:text-[#1E1E1E] hover:border-slate-300';

const STORAGE_KEY = 'pursuit_program_slug';

const ProgramAnalytics = () => {
  const token = useAuthStore((s) => s.token);
  const isSecondaryNavPage = useNavStore((s) => s.isSecondaryNavPage);
  const [activeTab, setActiveTab] = useState('program-performance');
  const [programs, setPrograms] = useState([]);
  const [programSlug, setProgramSlug] = useState(() => localStorage.getItem(STORAGE_KEY) || 'ai-native-builder');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/admin/dashboard/programs`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json())
      .then(data => { if (data.success) setPrograms(data.programs); })
      .catch(() => {});
  }, [token]);

  const handleProgramChange = (slug) => {
    setProgramSlug(slug);
    localStorage.setItem(STORAGE_KEY, slug);
  };

  return (
    <div className="min-h-screen bg-[#EFEFEF]">
      {/* Header */}
      <div className="bg-white border-b border-[#E3E3E3] px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
              Program Analytics
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">Cross-cohort health and pipeline metrics</p>
          </div>
          {programs.length > 1 && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <label className="text-xs text-slate-500 font-medium">Program</label>
              <select
                value={programSlug}
                onChange={(e) => handleProgramChange(e.target.value)}
                className="px-3 py-1.5 text-sm border border-[#E3E3E3] rounded-md bg-white text-[#1E1E1E] focus:border-[#4242EA] focus:outline-none"
              >
                {programs.map(p => (
                  <option key={p.slug} value={p.slug}>
                    {p.name}{p.organization ? ` — ${p.organization}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="bg-white border-b border-[#E3E3E3] px-8">
        <div className="max-w-7xl mx-auto w-full flex">
          {SUBTABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BASE} ${activeTab === tab.id ? TAB_ACTIVE : TAB_INACTIVE}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        {activeTab === 'program-performance' && <ProgramMetricsTab programSlug={programSlug} />}
        {activeTab === 'cohort-performance' && <CohortComparisonTab programSlug={programSlug} />}
      </div>
    </div>
  );
};

export default ProgramAnalytics;
