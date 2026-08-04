import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui/table';
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

// Curated Invoice Activity (ops queue) — July / August 2026
const NEW_INVOICES_JULY = [
  { name: 'Josue Villalona', amount: 1312.5, method: 'Bill.com', notes: 'New job — first invoice July 2026' },
  { name: 'Edwin Codrington', amount: 1312.5, method: 'Bill.com', notes: 'Off pause — reinstate at regular amount' },
  { name: 'Destiny Joyner', amount: 1062.5, method: 'Bill.com', notes: 'Off pause — reinstate at regular amount' },
  { name: 'Ariel Chen', amount: null, method: 'Pursuit Managed', notes: 'Amount based on July paycheck; Pursuit collects directly' },
  { name: 'Kelvin Saldana', amount: null, method: 'Pursuit Managed', notes: 'Amount based on July paycheck; Pursuit collects directly' },
  { name: 'Jacob Williams', amount: 350, method: 'Pursuit Managed', notes: 'Payment plan: $350/mo for July & August — total invoice amount based on July paycheck; Pursuit collects directly' },
];

const NEW_INVOICES_AUGUST = [
  { name: 'Kalila Green', amount: 1093.75, method: 'Direct Deposit', notes: 'New job — direct deposit set up; begin August 2026' },
  { name: 'Ethan Davey', amount: 1062.5, method: 'Pursuit Managed', notes: 'New job — Pursuit managed; begin August 2026' },
  { name: 'Daniel Chillemi', amount: 350, method: 'Pursuit Managed', notes: 'Payment plan: $350/mo × 6 months, then $1,800/mo × 6 months to catch up; begin August 2026' },
  { name: 'Rajiv Sukhnandan', amount: 1100, method: 'Direct Deposit', notes: 'New job — direct deposit set up; begin August 2026' },
];

const STOP_INVOICING = [
  { name: 'Anthony Cannonier', amount: 1125, method: 'Unemployed', notes: 'Pause until re-employed — do not invoice · job loss July' },
  { name: 'Zane Ahmed', amount: 1125, method: 'Unemployed', notes: 'Pause until re-employed — do not invoice · job loss July' },
  { name: 'Raymond Udeogu', amount: 1000, method: 'Unemployed', notes: 'Informed in July (need to confirm exact dates) — remove from August invoicing list' },
];

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
          <TableRow key={row.name}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtCurrency(row.amount)}</TableCell>
            <TableCell className="text-sm text-gray-700">{row.method}</TableCell>
            <TableCell className="text-xs text-gray-500 max-w-md">{row.notes}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
);

const BondStatus = () => {
  const newInvoiceCount = NEW_INVOICES_JULY.length + NEW_INVOICES_AUGUST.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-[#4242EA]" />
          Invoice Activity
        </CardTitle>
        <p className="text-xs text-gray-500 mt-1">
          Ops queue · {newInvoiceCount} new · {STOP_INVOICING.length} stop · notes include reason and payment method
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              New invoices — start invoicing
            </h3>
          </div>

          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">July</p>
          <InvoiceTable rows={NEW_INVOICES_JULY} />

          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mt-4 mb-2">
            Heads up — August
          </p>
          <InvoiceTable rows={NEW_INVOICES_AUGUST} />
        </div>

        <div>
          <div className="flex items-center gap-2 mb-2">
            <Ban className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
              Stop invoicing — job loss
            </h3>
          </div>
          <p className="text-xs text-gray-500 mb-2">July · pause / remove from August list</p>
          <InvoiceTable rows={STOP_INVOICING} />
        </div>
      </CardContent>
    </Card>
  );
};

export default BondStatus;
