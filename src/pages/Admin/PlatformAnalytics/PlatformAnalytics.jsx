import React, { useState } from 'react';
import useAuthStore from '../../../stores/authStore';
import useNavStore from '../../../stores/navStore';
import { usePermissions } from '../../../hooks/usePermissions';
import IntegrationsStatusTab from './tabs/IntegrationsStatusTab';
import OverviewTab from './tabs/OverviewTab';
import UsageBreakdownTab from './tabs/UsageBreakdownTab';
import TaskInsightsTab from './tabs/TaskInsightsTab';
import CostBillingTab from './tabs/CostBillingTab';
import TrendsTab from './tabs/TrendsTab';

const SectionHeader = ({ children }) => (
  <div className="mb-6 mt-8 first:mt-0">
    <span className="text-xs font-bold uppercase tracking-wider text-[#4242EA] border-b-2 border-[#4242EA] pb-2 mb-4 inline-block">
      {children}
    </span>
  </div>
);

const PlatformAnalytics = () => {
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);
  const { canAccessPage } = usePermissions();
  const isSecondaryNavPage = useNavStore((s) => s.isSecondaryNavPage);

  // Date range state — default last 30 days
  const [endDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [startDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });

  if (!canAccessPage('platform_analytics')) {
    return (
      <div className="min-h-screen bg-[#EFEFEF] p-8 flex items-center justify-center">
        <div className="bg-red-50 text-red-600 px-6 py-8 rounded-lg border border-red-200 text-center max-w-md">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p>You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EFEFEF]">
      {/* Page header */}
      {!isSecondaryNavPage && (
        <div className="bg-white border-b border-[#E3E3E3] px-8 py-4">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
              Platform Analytics
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              LLM usage, token consumption, and cost tracking
            </p>
          </div>
        </div>
      )}

      {/* All sections rendered sequentially */}
      <div className="max-w-7xl mx-auto px-8 py-6">
        <SectionHeader>Integrations Status</SectionHeader>
        <IntegrationsStatusTab token={token} startDate={startDate} endDate={endDate} />

        <SectionHeader>Overview</SectionHeader>
        <OverviewTab token={token} startDate={startDate} endDate={endDate} />

        <SectionHeader>Usage Breakdown</SectionHeader>
        <UsageBreakdownTab token={token} startDate={startDate} endDate={endDate} />

        <SectionHeader>Task Insights</SectionHeader>
        <TaskInsightsTab token={token} startDate={startDate} endDate={endDate} />

        <SectionHeader>Cost & Billing</SectionHeader>
        <CostBillingTab token={token} startDate={startDate} endDate={endDate} />

        <SectionHeader>Trends</SectionHeader>
        <TrendsTab token={token} startDate={startDate} endDate={endDate} />
      </div>
    </div>
  );
};

export default PlatformAnalytics;
