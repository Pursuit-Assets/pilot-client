import React from 'react';
import { Card, CardContent } from '../../../../components/ui/card';
import BondStatus from './BondStatus';

const formatCurrency = (n) => {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
};

const StatCard = ({ label, value, sublabel }) => (
  <Card>
    <CardContent className="pt-6">
      <div className="text-xs uppercase tracking-wide text-gray-500 font-medium">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
      {sublabel && <div className="text-xs text-gray-500 mt-1">{sublabel}</div>}
    </CardContent>
  </Card>
);

const CohortKpis = ({ overview }) => {
  if (!overview) {
    return <div className="text-gray-500 text-sm">No overview data yet.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard
          label="New Invoices (last 12 months)"
          value={overview.hiredLastYear ?? '—'}
          sublabel="From invoice activity"
        />
        <StatCard
          label="Layoffs (last 12 months)"
          value={overview.laidOffLastYear ?? '—'}
          sublabel="From stop / pause invoicing"
        />
        <StatCard
          label="Median Current Salary"
          value={formatCurrency(overview.medianCurrentSalary)}
          sublabel={overview.medianSalaryLift != null ? `+${formatCurrency(overview.medianSalaryLift)} lift` : null}
        />
      </div>

      <BondStatus />
    </div>
  );
};

export default CohortKpis;
