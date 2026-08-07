import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
import useAuthStore from '../../../../stores/authStore';
import { Ban, CheckCircle2, PlayCircle } from 'lucide-react';

const fmtCurrency = (n) => {
  if (n == null) return 'TBD';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

// effective_month is a plain YYYY-MM-DD string from the API. Parsed as UTC deliberately:
// `new Date('2026-08-01')` is midnight UTC, which in any negative-offset timezone renders
// as July 31 — the header would name the wrong month for every US user.
const fmtMonth = (iso) => {
  if (!iso) return '';
  const [y, m] = iso.split('-');
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const InvoiceTable = ({ rows }) => (
  <div className="border rounded-lg overflow-hidden">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Monthly Amount</TableHead>
          <TableHead>Payment Method</TableHead>
          <TableHead>Notes</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.invoice_action_id}>
            <TableCell className="font-medium">{row.fellow_name}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtCurrency(row.monthly_amount)}</TableCell>
            <TableCell className="text-sm text-gray-700">{row.payment_method || '—'}</TableCell>
            <TableCell className="text-xs text-gray-500 max-w-md">{row.notes}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const BondStatus = () => {
  const token = useAuthStore((s) => s.token);
  const [queue, setQueue] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetch(`${import.meta.env.VITE_API_URL}/api/job-outcomes/invoice-queue`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rows) => { if (!cancelled) setQueue(rows); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  // Grouped here rather than server-side so a new month needs no code change: whatever
  // months the queue contains become sections, in chronological order.
  const { starts, stops, startCount } = useMemo(() => {
    const group = (action) => {
      const byMonth = new Map();
      for (const row of queue) {
        if (row.action !== action) continue;
        if (!byMonth.has(row.effective_month)) byMonth.set(row.effective_month, []);
        byMonth.get(row.effective_month).push(row);
      }
      return [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };
    const s = group('start');
    return {
      starts: s,
      stops: group('stop'),
      startCount: s.reduce((n, [, rows]) => n + rows.length, 0),
    };
  }, [queue]);

  const stopCount = stops.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-[#4242EA]" />
          Invoice Activity
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          {isLoading
            ? 'Loading ops queue…'
            : `Ops queue · ${startCount} new · ${stopCount} stop · notes include reason and payment method`}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="text-sm text-red-600">Couldn’t load the invoice queue: {error}</div>
        )}

        {!isLoading && !error && !queue.length && (
          <div className="text-sm text-gray-500">
            No invoice starts or stops queued for this month or last.
          </div>
        )}

        {starts.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                New invoices — start invoicing
              </h3>
            </div>
            {starts.map(([month, rows], i) => (
              <div key={month} className={i === 0 ? '' : 'mt-4'}>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  {fmtMonth(month)}
                </p>
                <InvoiceTable rows={rows} />
              </div>
            ))}
          </div>
        )}

        {stops.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Ban className="h-4 w-4 text-red-600" />
              <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                Stop invoicing — job loss
              </h3>
            </div>
            {stops.map(([month, rows], i) => (
              <div key={month} className={i === 0 ? '' : 'mt-4'}>
                <p className="text-xs text-gray-500 mb-2">{fmtMonth(month)} · pause / remove from invoicing list</p>
                <InvoiceTable rows={rows} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default BondStatus;
