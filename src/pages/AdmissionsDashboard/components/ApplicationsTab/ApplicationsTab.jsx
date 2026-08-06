import React, { useMemo, useCallback, useDeferredValue } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../../components/ui/select';
import { Checkbox } from '../../../../components/ui/checkbox';
import { Badge } from '../../../../components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../../components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '../../../../components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../../../../components/ui/dialog';
import { formatPhoneNumber, getStatusBadgeClasses, formatStatus, getColumnLabel } from '../shared/utils';
import { Input } from '../../../../components/ui/input';
import Swal from 'sweetalert2';
import { toast } from 'sonner';

// Filter options for each column
const filterOptions = {
  status: [
    { value: '', label: 'All' },
    { value: 'no_application', label: 'No Application' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'submitted', label: 'Submitted' },
    { value: 'ineligible', label: 'Ineligible' },
  ],
  recommendation: [
    { value: '', label: 'All' },
    { value: 'strong_recommend', label: 'Strong Recommend' },
    { value: 'recommend', label: 'Recommend' },
    { value: 'review_needed', label: 'Review Needed' },
    { value: 'not_recommend', label: 'Not Recommend' },
  ],
  final_status: [
    { value: '', label: 'All' },
    { value: 'strong_recommend', label: 'Strong Recommend' },
    { value: 'recommend', label: 'Recommend' },
    { value: 'review_needed', label: 'Review Needed' },
    { value: 'not_recommend', label: 'Not Recommend' },
  ],
  info_session_status: [
    { value: '', label: 'All' },
    { value: 'not_registered', label: 'Not Registered' },
    { value: 'registered', label: 'Registered' },
    { value: 'attended', label: 'Attended' },
    { value: 'attended_event', label: 'Attended Event' },
    { value: 'no_show', label: 'No Show' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  workshop_status: [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'invited', label: 'Invited' },
    { value: 'registered', label: 'Registered' },
    { value: 'attended', label: 'Attended' },
    { value: 'no_show', label: 'No Show' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  program_admission_status: [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'accepted', label: 'Accepted' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ],
  enrollment_status: [
    { value: '', label: 'All' },
    { value: 'pending', label: 'Pending' },
    { value: 'enrolled', label: 'Accepted' },
    { value: 'deferred', label: 'Deferred' },
    { value: 'withdrawn', label: 'Withdrawn' },
  ],
  source_bucket: [
    { value: '', label: 'All' },
    { value: 'selected_this_cycle', label: 'Selected This Cycle' },
    { value: 'carried_forward', label: 'Carried Forward' },
  ],
  account_age_bucket: [
    { value: '', label: 'All' },
    { value: '0-14', label: '0-14 days' },
    { value: '0-30', label: '0-30 days' },
    { value: '31-60', label: '31-60 days' },
    { value: '61-90', label: '61-90 days' },
    { value: '91-120', label: '91-120 days' },
    { value: '121-150', label: '121-150 days' },
    { value: '151-180', label: '151-180 days' },
    { value: '180+', label: '180+ days' },
  ],
  application_age_bucket: [
    { value: '', label: 'All' },
    { value: '0-14', label: '0-14 days' },
    { value: '0-30', label: '0-30 days' },
    { value: '31-60', label: '31-60 days' },
    { value: '61-90', label: '61-90 days' },
    { value: '91-120', label: '91-120 days' },
    { value: '121-150', label: '121-150 days' },
    { value: '151-180', label: '151-180 days' },
    { value: '180+', label: '180+ days' },
  ],
  last_activity_bucket: [
    { value: '', label: 'All' },
    { value: '0-14', label: '0-14 days' },
    { value: '0-30', label: '0-30 days' },
    { value: '31-60', label: '31-60 days' },
    { value: '61-90', label: '61-90 days' },
    { value: '91-120', label: '91-120 days' },
    { value: '121-150', label: '121-150 days' },
    { value: '151-180', label: '151-180 days' },
    { value: '180+', label: '180+ days' },
  ],
  deliberation: [
    { value: '', label: 'All' },
    { value: 'yes', label: 'Yes' },
    { value: 'maybe', label: 'Maybe' },
    { value: 'no', label: 'No' },
  ],
  structured_task_grade: [
    { value: '', label: 'All' },
    { value: 'green', label: 'Green' },
    { value: 'yellow', label: 'Yellow' },
    { value: 'red', label: 'Red' },
  ],
  pledge_completed: [
    { value: '', label: 'All' },
    { value: 'true', label: 'Signed' },
    { value: 'false', label: 'Not Signed' },
  ],
  gja_signed: [
    { value: '', label: 'All' },
    { value: 'true', label: 'Signed' },
    { value: 'false', label: 'Not Signed' },
  ],
};

// Display label for the Offer Accepted column: the derived server value stays
// 'enrolled' (flipped when both the pledge AND the GJA are signed), but the
// dashboard renders it as "Accepted".
const formatEnrollmentStatus = (status) =>
  status === 'enrolled' ? 'Accepted' : formatStatus(status);

// Column labels for the table
const columnLabels = {
  name: 'Name',
  email: 'Email',
  phone: 'Phone',
  app_start_date: 'App Start Date',
  status: 'Status',
  assessment: 'Assessment',
  info_session: 'Info Session',
  workshop: 'Workshop',
  structured_task_grade: 'Workshop Grade',
  admission: 'Offer Extended',
  enrollment: 'Offer Accepted',
  cohort: 'Cohort',
  source_bucket: 'Source',
  account_age_bucket: 'Account Age',
  application_age_bucket: 'Application Age',
  last_activity_bucket: 'Last Activity',
  deliberation: 'Deliberation',
  notes: 'Notes',
  age: 'Age',
  gender: 'Gender',
  race: 'Race/Ethnicity',
  education: 'Education',
  referral: 'Referral Source',
  referral_detail: 'Referral Detail',
  referral_channel: 'Referral Channel',
  pledge: 'Pledge Signed',
  gja: 'GJA Signed',
  income: 'Pre-Program Income'

};


// Helper function to calculate age from date of birth
const calculateAge = (dateOfBirth) => {
  if (!dateOfBirth) return null;
  
  try {
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  } catch {
    return null;
  }
};

const formatDate = (dateValue, options = {}) => {
  if (!dateValue) return '-';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options
  });
};

// Memoized ApplicationRow component to prevent unnecessary re-renders
const ApplicationRow = React.memo(({ 
  app, 
  visibleColumns, 
  isSelected, 
  onSelect, 
  onViewApplication,
  onOpenNotes,
  onDeliberationChange,
  onViewGja,
  cohortNameMap
}) => {
  return (
    <TableRow key={app.applicant_id} className="hover:bg-gray-50">
      <TableCell>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(app.applicant_id, checked)}
        />
      </TableCell>
      {visibleColumns.name && (
        <TableCell 
          className="font-medium font-proxima text-[#4242ea] hover:text-[#3333d1] cursor-pointer hover:underline"
          onClick={() => onViewApplication(app.applicant_id)}
        >
          {app.first_name} {app.last_name}
        </TableCell>
      )}
      {visibleColumns.email && (
        <TableCell className="font-proxima text-gray-600">
          {app.email || 'N/A'}
        </TableCell>
      )}
      {visibleColumns.phone && (
        <TableCell className="font-proxima text-gray-600">
          {formatPhoneNumber(app.phone_number)}
        </TableCell>
      )}
      {visibleColumns.app_start_date && (
        <TableCell className="font-proxima text-gray-600">
          {app.created_at ? new Date(app.created_at).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          }) : '-'}
        </TableCell>
      )}
      {visibleColumns.status && (
        <TableCell>
          <Badge className={`${getStatusBadgeClasses(app.status)} font-proxima`}>
            {formatStatus(app.status)}
          </Badge>
        </TableCell>
      )}
      {visibleColumns.assessment && (
        <TableCell>
          {(app.recommendation || app.final_status) && (
            <Badge className={`${getStatusBadgeClasses(app.final_status || app.recommendation)} font-proxima`}>
              {formatStatus(app.final_status || app.recommendation)}
            </Badge>
          )}
        </TableCell>
      )}
      {visibleColumns.info_session && (
        <TableCell>
          {app.info_session_status && (
            <Badge className={`${getStatusBadgeClasses(app.info_session_status)} font-proxima`}>
              {formatStatus(app.info_session_status)}
            </Badge>
          )}
        </TableCell>
      )}
      {visibleColumns.workshop && (
        <TableCell>
          {app.workshop_status && (
            <Badge className={`${getStatusBadgeClasses(app.workshop_status)} font-proxima`}>
              {formatStatus(app.workshop_status)}
            </Badge>
          )}
        </TableCell>
      )}
      {visibleColumns.structured_task_grade && (
        <TableCell>
          {app.structured_task_grade ? (
            <Badge className={`font-proxima ${
              app.structured_task_grade === 'green' ? 'bg-green-100 text-green-800' :
              app.structured_task_grade === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
              app.structured_task_grade === 'red' ? 'bg-red-100 text-red-800' :
              'bg-gray-100 text-gray-600'
            }`}>
              {app.structured_task_grade}
            </Badge>
          ) : '-'}
        </TableCell>
      )}
      {visibleColumns.admission && (
        <TableCell>
          {app.program_admission_status && (
            <Badge className={`${getStatusBadgeClasses(app.program_admission_status)} font-proxima`}>
              {formatStatus(app.program_admission_status)}
            </Badge>
          )}
        </TableCell>
      )}
      {visibleColumns.enrollment && (
        <TableCell>
          {app.enrollment_status ? (
            <Badge className={`${getStatusBadgeClasses(app.enrollment_status, 'enrollment')} font-proxima`}>
              {formatEnrollmentStatus(app.enrollment_status)}
            </Badge>
          ) : '-'}
        </TableCell>
      )}
      {visibleColumns.cohort && (
        <TableCell className="font-proxima text-gray-600 max-w-[180px] truncate" title={cohortNameMap?.[app.cohort_id] || app.cohort_name || ''}>
          {cohortNameMap?.[app.cohort_id] || app.cohort_name || '-'}
        </TableCell>
      )}
      {visibleColumns.source_bucket && (
        <TableCell>
          {app.source_bucket ? (
            <Badge className="bg-slate-100 text-slate-700 font-proxima">
              {formatStatus(app.source_bucket)}
            </Badge>
          ) : '-'}
        </TableCell>
      )}
      {visibleColumns.account_age_bucket && (
        <TableCell className="font-proxima text-gray-600">
          {app.account_age_bucket || '-'}
        </TableCell>
      )}
      {visibleColumns.application_age_bucket && (
        <TableCell className="font-proxima text-gray-600">
          {app.application_age_bucket || '-'}
        </TableCell>
      )}
      {visibleColumns.last_activity_bucket && (
        <TableCell
          className="font-proxima text-gray-600"
          title={app.last_activity_at ? new Date(app.last_activity_at).toLocaleString() : ''}
        >
          {formatDate(app.last_activity_at)}
        </TableCell>
      )}
      {visibleColumns.deliberation && (
        <TableCell>
          <Select
            value={app.deliberation || '_none'}
            onValueChange={(value) => onDeliberationChange(app.applicant_id, value === '_none' ? '' : value)}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs font-proxima">
              <SelectValue placeholder="Set" />
            </SelectTrigger>
            <SelectContent className="font-proxima">
              <SelectItem value="_none">None</SelectItem>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="maybe">Maybe</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </TableCell>
      )}
      {visibleColumns.age && (
        <TableCell className="font-proxima text-gray-600">
          {calculateAge(app.date_of_birth) || '-'}
        </TableCell>
      )}
      {visibleColumns.gender && (
        <TableCell className="font-proxima text-gray-600">
          {app.gender || '-'}
        </TableCell>
      )}
      {visibleColumns.race && (
        <TableCell className="font-proxima text-gray-600 max-w-[150px] truncate" title={app.race_ethnicity}>
          {app.race_ethnicity || '-'}
        </TableCell>
      )}
      {visibleColumns.education && (
        <TableCell className="font-proxima text-gray-600 max-w-[150px] truncate" title={app.education_level}>
          {app.education_level || '-'}
        </TableCell>
      )}
      {visibleColumns.referral && (
        <TableCell className="font-proxima text-gray-600 max-w-[150px] truncate" title={app.referral_source}>
          {app.referral_source || '-'}
        </TableCell>
      )}
      {visibleColumns.referral_detail && (
        <TableCell className="font-proxima text-gray-600 max-w-[150px] truncate" title={app.referral_detail}>
          {app.referral_detail || '-'}
        </TableCell>
      )}
      {visibleColumns.referral_channel && (
        <TableCell className="font-proxima text-gray-600 max-w-[150px] truncate" title={app.referral_channel}>
          {app.referral_channel || '-'}
        </TableCell>
      )}
      {visibleColumns.pledge && (
        <TableCell>
          {app.pledge_completed ? (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-proxima bg-green-100 text-green-800"
              title={app.pledge_completed_at ? `Signed on ${new Date(app.pledge_completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Pledge signed'}
            >
              ✓ Signed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-proxima bg-gray-100 text-gray-500">
              — Not signed
            </span>
          )}
        </TableCell>
      )}
      {visibleColumns.gja && (
        <TableCell>
          {app.gja_signed ? (
            <button
              type="button"
              onClick={() => onViewGja(app)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-proxima bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer"
              title={`${app.gja_signed_at ? `Signed on ${new Date(app.gja_signed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : 'Good Jobs Agreement signed'}${app.gja_source ? ` (via ${app.gja_source === 'docusign' ? 'DocuSign' : 'manual upload'})` : ''} — click to view`}
            >
              ✓ Signed
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-proxima bg-gray-100 text-gray-500">
              — Not signed
            </span>
          )}
        </TableCell>
      )}

      {visibleColumns.income && (
        <TableCell className="font-proxima text-gray-600 max-w-[160px] truncate" title={app.personal_income}>
          {app.personal_income || '-'}
        </TableCell>
      )}


      {visibleColumns.notes && (
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenNotes(app)}
            className="font-proxima text-[#4242ea] hover:text-[#3333d1]"
          >
            📝
          </Button>
        </TableCell>
      )}
    </TableRow>
  );
});

ApplicationRow.displayName = 'ApplicationRow';

// Pagination component
const Pagination = ({ currentPage, totalPages, totalItems, pageSize, onPageChange }) => {
  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);
      
      // Calculate start and end of visible range
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalPages - 1, currentPage + 1);
      
      // Adjust if at the beginning
      if (currentPage <= 3) {
        end = 4;
      }
      
      // Adjust if at the end
      if (currentPage >= totalPages - 2) {
        start = totalPages - 3;
      }
      
      // Add ellipsis if needed before middle pages
      if (start > 2) {
        pages.push('...');
      }
      
      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }
      
      // Add ellipsis if needed after middle pages
      if (end < totalPages - 1) {
        pages.push('...');
      }
      
      // Always show last page
      pages.push(totalPages);
    }
    
    return pages;
  };

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600 font-proxima">
        Showing {startItem}-{endItem} of {totalItems} applicants
      </span>
      
      <div className="flex items-center gap-1">
        {/* Previous button */}
        <Button
          variant="outline"
          size="sm"
          className="font-proxima h-8 px-2"
          disabled={currentPage === 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          ← Prev
        </Button>
        
        {/* Page numbers */}
        {getPageNumbers().map((page, index) => (
          page === '...' ? (
            <span key={`ellipsis-${index}`} className="px-2 text-gray-400">...</span>
          ) : (
            <Button
              key={page}
              variant={currentPage === page ? 'default' : 'outline'}
              size="sm"
              className={`font-proxima h-8 w-8 p-0 ${currentPage === page ? 'bg-[#4242ea] hover:bg-[#3333d1]' : ''}`}
              onClick={() => onPageChange(page)}
            >
              {page}
            </Button>
          )
        ))}
        
        {/* Next button */}
        <Button
          variant="outline"
          size="sm"
          className="font-proxima h-8 px-2"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
};

const ApplicationsTab = ({
  loading,
  applications,
  cohorts,
  applicationFilters,
  setApplicationFilters,
  visibleColumns,
  setVisibleColumns,
  columnSort,
  handleColumnSort,
  selectedApplicants,
  setSelectedApplicants,
  openFilterColumn,
  setOpenFilterColumn,
  openNotesModal,
  handleDeliberationChange,
  setBulkActionsModalOpen,
  fetchApplications,
  token,
  searchIndex,
  currentPage,
  pageSize,
  onPageChange,
  loadAllMode,
  onLoadAll,
  onReturnToPagination
}) => {
  const navigate = useNavigate();
  const [tableSearchTerm, setTableSearchTerm] = React.useState('');
  const [targetCohortId, setTargetCohortId] = React.useState('');
  const [movingCohort, setMovingCohort] = React.useState(false);

  // ── Good Jobs Agreement viewer ──────────────────────────────────────────────
  const [gjaModalOpen, setGjaModalOpen] = React.useState(false);
  const [gjaLoading, setGjaLoading] = React.useState(false);
  const [gjaError, setGjaError] = React.useState('');
  const [gjaTitle, setGjaTitle] = React.useState('');
  const [gjaFileType, setGjaFileType] = React.useState(null); // 'pdf' | 'image' | 'unsupported'
  const [gjaContent, setGjaContent] = React.useState('');     // url rendered in iframe/img
  const [gjaOpenUrl, setGjaOpenUrl] = React.useState('');     // url for "Open in new tab"
  const gjaObjectUrlRef = React.useRef(null);

  const revokeGjaObjectUrl = React.useCallback(() => {
    if (gjaObjectUrlRef.current) {
      URL.revokeObjectURL(gjaObjectUrlRef.current);
      gjaObjectUrlRef.current = null;
    }
  }, []);

  const openGjaModal = React.useCallback(async (app) => {
    setGjaModalOpen(true);
    setGjaLoading(true);
    setGjaError('');
    setGjaContent('');
    setGjaOpenUrl('');
    setGjaFileType(null);
    setGjaTitle(`${app.first_name} ${app.last_name} — Good Jobs Agreement`);
    revokeGjaObjectUrl();

    try {
      const metaRes = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admissions/applicants/${app.applicant_id}/gja`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaRes.ok) throw new Error('Failed to load agreement');
      const meta = await metaRes.json();
      if (!meta.signed) {
        setGjaError('No signed Good Jobs Agreement on file.');
        return;
      }

      const fileName = meta.fileName || 'agreement.pdf';
      const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(fileName);
      const isPdf = /\.pdf$/i.test(fileName);

      let viewUrl;
      if (meta.viewAuth === 'bearer') {
        // Same-origin API stream (DocuSign PDF) needs the auth header, which an
        // iframe src can't send — fetch it as a blob and render the object URL.
        const base = meta.viewUrl.startsWith('http')
          ? meta.viewUrl
          : `${import.meta.env.VITE_API_URL}${meta.viewUrl}`;
        const docRes = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
        if (!docRes.ok) throw new Error('Failed to load signed document');
        const blob = await docRes.blob();
        viewUrl = URL.createObjectURL(blob);
        gjaObjectUrlRef.current = viewUrl;
      } else {
        // Pre-signed GCS URL (manual upload) — usable directly.
        viewUrl = meta.viewUrl.startsWith('http')
          ? meta.viewUrl
          : `${import.meta.env.VITE_API_URL}${meta.viewUrl}`;
      }

      setGjaOpenUrl(viewUrl);
      if (isImage) {
        setGjaFileType('image');
        setGjaContent(viewUrl);
      } else if (isPdf) {
        setGjaFileType('pdf');
        setGjaContent(viewUrl);
      } else {
        setGjaFileType('unsupported');
        setGjaError('Preview not available for this file type. Use "Open in new tab" to download.');
      }
    } catch (err) {
      setGjaError(err.message || 'Failed to load agreement');
    } finally {
      setGjaLoading(false);
    }
  }, [token, revokeGjaObjectUrl]);

  React.useEffect(() => () => revokeGjaObjectUrl(), [revokeGjaObjectUrl]);
  const [csvExportColumns, setCsvExportColumns] = React.useState({
    name: true,
    email: true,
    phone: true,
    app_start_date: true,
    status: true,
    assessment: true,
    info_session: true,
    workshop: true,
    workshop_grade: false,
    admission: true,
    deliberation: false,
    age: false,
    gender: false,
    race_ethnicity: false,
    education: false,
    referral: false,
    referral_detail: false,
    referral_channel: false,
    pledge: false,
    gja: false,
    income: false
  });

  // Sync CSV export columns with visible columns when opening export
  const initializeCsvColumnsFromVisible = React.useCallback(() => {
    setCsvExportColumns({
      name: visibleColumns.name ?? true,
      email: visibleColumns.email ?? true,
      phone: visibleColumns.phone ?? true,
      app_start_date: visibleColumns.app_start_date ?? false,
      status: visibleColumns.status ?? true,
      assessment: visibleColumns.assessment ?? true,
      info_session: visibleColumns.info_session ?? true,
      workshop: visibleColumns.workshop ?? true,
      workshop_grade: visibleColumns.structured_task_grade ?? false,
      admission: visibleColumns.admission ?? true,
      enrollment: visibleColumns.enrollment ?? true,
      cohort: visibleColumns.cohort ?? true,
      source_bucket: visibleColumns.source_bucket ?? false,
      account_age_bucket: visibleColumns.account_age_bucket ?? false,
      application_age_bucket: visibleColumns.application_age_bucket ?? false,
      last_activity_bucket: visibleColumns.last_activity_bucket ?? true,
      deliberation: visibleColumns.deliberation ?? false,
      age: visibleColumns.age ?? false,
      gender: visibleColumns.gender ?? false,
      race_ethnicity: visibleColumns.race ?? false,
      education: visibleColumns.education ?? false,
      referral: visibleColumns.referral ?? false,
      referral_detail: visibleColumns.referral_detail ?? false,
      referral_channel: visibleColumns.referral_channel ?? false,
      pledge: visibleColumns.pledge ?? false,
      gja: visibleColumns.gja ?? true,
      income: visibleColumns.income ?? false
    });
  }, [visibleColumns]);

  const cohortNameMap = useMemo(() => {
    const map = {};
    (cohorts || []).forEach((cohort) => {
      map[cohort.cohort_id] = cohort.name;
    });
    return map;
  }, [cohorts]);

  const handleMoveSelectedToCohort = useCallback(async () => {
    if (selectedApplicants.length === 0 || !targetCohortId) return;

    // A bulk move is how 13 already-decided applicants landed in the actively-recruiting cohort
    // on 2026-07-07 with nothing recorded about who or why. Every move is now audited, and the
    // server refuses to move an applicant whose admission decision is final without a reason.
    const { value: reason, isConfirmed } = await Swal.fire({
      title: `Move ${selectedApplicants.length} applicant${selectedApplicants.length === 1 ? '' : 's'} to ${cohortNameMap[targetCohortId] || 'this cohort'}?`,
      input: 'text',
      inputLabel: 'Reason for the move (recorded in the audit trail)',
      inputPlaceholder: 'e.g. applied to the wrong cycle by mistake',
      showCancelButton: true,
      confirmButtonText: 'Move applicants'
    });
    if (!isConfirmed) return;

    setMovingCohort(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/bulk-actions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'move_to_cohort',
          applicant_ids: selectedApplicants,
          cohort_id: targetCohortId,
          notes: (reason || '').trim() || null
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to move selected applicants');
      }

      // The endpoint answers 200 even when individual applicants were refused (deferred, or a
      // final decision with no reason). Those per-row results used to be dropped on the floor,
      // so a partly-refused bulk move looked like a clean success.
      const data = await response.json().catch(() => ({}));
      const updates = data?.results?.cohort_updates || [];
      const failed = updates.filter((u) => !u.success);
      const moved = updates.length - failed.length;

      await fetchApplications();
      setSelectedApplicants([]);
      setTargetCohortId('');

      if (failed.length === 0) {
        toast.success(`Moved ${moved} applicant${moved === 1 ? '' : 's'}`, {
          description: `Now in ${cohortNameMap[targetCohortId] || 'the selected cohort'}.`
        });
      } else {
        // Grouped by reason rather than listed per applicant. Every refusal in a bulk move has one
        // of two causes, and both are acted on in bulk too ("reinstate these", "give a reason"), so
        // 20 identical lines are worse than one count per cause. Longer duration because a skipped
        // applicant is follow-up work, not an FYI.
        const byReason = failed.reduce((acc, f) => {
          const reason = f.error || 'Unknown reason';
          acc[reason] = (acc[reason] || 0) + 1;
          return acc;
        }, {});
        // JSX, not a \n-joined string — sonner renders the description as HTML, where a newline
        // collapses to a space and every reason would run together on one line.
        const description = (
          <span className="flex flex-col gap-1">
            {Object.entries(byReason).map(([reason, n]) => (
              <span key={reason}>{n} × {reason}</span>
            ))}
          </span>
        );

        const notify = moved > 0 ? toast.warning : toast.error;
        notify(
          moved > 0
            ? `Moved ${moved}, skipped ${failed.length}`
            : 'No applicants were moved',
          { description, duration: 12000 }
        );
      }
    } catch (error) {
      console.error('Error moving selected applicants to cohort:', error);
      toast.error('Bulk move failed', {
        description: error.message || 'Failed to move selected applicants',
        duration: 8000
      });
    } finally {
      setMovingCohort(false);
    }
  }, [selectedApplicants, targetCohortId, token, fetchApplications, setSelectedApplicants, cohortNameMap]);
  
  // Handle navigating to applicant detail
  const handleViewApplication = useCallback((applicantId) => {
    navigate(`/admissions-dashboard/applicant/${applicantId}`);
  }, [navigate]);

  // Sort and filter applications
  // When searching, use the full search index (all applicants) as the data source
  // When not searching, use the paginated server data as before
  // useDeferredValue keeps the input responsive while deferring the heavy table re-render
  const deferredSearchTerm = useDeferredValue(tableSearchTerm);
  const isSearching = deferredSearchTerm.trim().length > 0;

  const sortedApplications = useMemo(() => {
    const dataSource = isSearching
      ? (searchIndex || [])
      : (applications?.applications || []);
    
    if (dataSource.length === 0) return [];
    
    let sorted = [...dataSource];
    
    // Apply client-side search filter (only when searching via the search index)
    if (isSearching) {
      const searchLower = deferredSearchTerm.toLowerCase().trim();
      sorted = sorted.filter(app => {
        const fullName = `${app.first_name || ''} ${app.last_name || ''}`.toLowerCase();
        const email = (app.email || '').toLowerCase();
        const phone = (app.phone_number || '').toLowerCase();
        return fullName.includes(searchLower) || email.includes(searchLower) || phone.includes(searchLower);
      });
    }
    
    if (columnSort.column) {
      sorted.sort((a, b) => {
        let aVal, bVal;
        
        if (columnSort.column === 'name') {
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
        } else {
          aVal = a[columnSort.column];
          bVal = b[columnSort.column];
        }
        
        if (aVal === null || aVal === undefined) aVal = '';
        if (bVal === null || bVal === undefined) bVal = '';
        
        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }
        
        if (aVal < bVal) return columnSort.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return columnSort.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    
    return sorted;
  }, [applications, searchIndex, columnSort, deferredSearchTerm, isSearching]);

  // Calculate pagination values
  const totalItems = applications?.total || 0;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // Handle select all (only selects current page)
  const handleSelectAll = useCallback((checked) => {
    if (checked) {
      setSelectedApplicants(sortedApplications?.map(app => app.applicant_id) || []);
    } else {
      setSelectedApplicants([]);
    }
  }, [sortedApplications, setSelectedApplicants]);

  // Handle individual selection
  const handleSelectApplicant = useCallback((applicantId, checked) => {
    if (checked) {
      setSelectedApplicants(prev => [...prev, applicantId]);
    } else {
      setSelectedApplicants(prev => prev.filter(id => id !== applicantId));
    }
  }, [setSelectedApplicants]);

  // CSV export column configuration
  // Note: Export endpoint returns demographics data in a nested 'demographics' object
  const csvColumnConfig = {
    name: { label: 'Name', getValue: (app) => `${app.first_name || ''} ${app.last_name || ''}` },
    email: { label: 'Email', getValue: (app) => app.email || '' },
    phone: { label: 'Phone', getValue: (app) => app.phone_number || '' },
    app_start_date: { label: 'App Start Date', getValue: (app) => app.created_at ? new Date(app.created_at).toLocaleDateString() : '' },
    status: { label: 'Status', getValue: (app) => app.status || '' },
    assessment: { label: 'Assessment', getValue: (app) => app.recommendation || app.final_status || '' },
    info_session: { label: 'Info Session', getValue: (app) => app.info_session_status || '' },
    workshop: { label: 'Workshop', getValue: (app) => app.workshop_status || '' },
    workshop_grade: { label: 'Workshop Grade', getValue: (app) => app.structured_task_grade || '' },
    admission: { label: 'Offer Extended', getValue: (app) => app.program_admission_status || '' },
    enrollment: { label: 'Offer Accepted', getValue: (app) => app.enrollment_status || '' },
    cohort: { label: 'Cohort', getValue: (app) => cohortNameMap[app.cohort_id] || app.cohort_name || '' },
    source_bucket: { label: 'Source Bucket', getValue: (app) => app.source_bucket || '' },
    account_age_bucket: { label: 'Account Age Bucket', getValue: (app) => app.account_age_bucket || '' },
    application_age_bucket: { label: 'Application Age Bucket', getValue: (app) => app.application_age_bucket || '' },
    last_activity_bucket: { label: 'Last Activity Date', getValue: (app) => app.last_activity_at ? new Date(app.last_activity_at).toLocaleDateString() : '' },
    deliberation: { label: 'Deliberation', getValue: (app) => app.deliberation || '' },
    age: { label: 'Age', getValue: (app) => {
      const dob = app.demographics?.date_of_birth || app.date_of_birth;
      return dob ? calculateAge(dob) || '' : '';
    }},
    gender: { label: 'Gender', getValue: (app) => app.demographics?.gender || app.gender || '' },
    race_ethnicity: { label: 'Race/Ethnicity', getValue: (app) => app.demographics?.race_ethnicity || app.race_ethnicity || '' },
    education: { label: 'Education', getValue: (app) => app.demographics?.education_level || app.education_level || '' },
    referral: { label: 'Referral Source', getValue: (app) => app.demographics?.reason_for_applying || app.demographics?.referral_source || app.referral_source || '' },
    referral_detail: { label: 'Referral Detail', getValue: (app) => app.demographics?.referral_detail || app.referral_detail || '' },
    referral_channel: { label: 'Referral Channel', getValue: (app) => app.demographics?.referral_channel || app.referral_channel || '' },
    pledge: { label: 'Pledge Signed', getValue: (app) => app.pledge_completed ? 'Yes' : 'No' },
    gja: { label: 'GJA Signed', getValue: (app) => app.gja_signed ? 'Yes' : 'No' },
    income: { label: 'Pre-Program Income', getValue: (app) => app.personal_income || '' }
  };

  // Handle CSV export
  const handleExportCSV = useCallback(async () => {
    if (selectedApplicants.length === 0) return;
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admissions/applicants/export`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedApplicants })
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch detailed applicant data');
      }
      
      const detailedApplicantData = await response.json();
      
      if (!detailedApplicantData || detailedApplicantData.length === 0) {
        alert('No data to export');
        return;
      }

      // Get selected columns
      const selectedCols = Object.entries(csvExportColumns)
        .filter(([_, isSelected]) => isSelected)
        .map(([key]) => key);
      
      if (selectedCols.length === 0) {
        alert('Please select at least one column to export');
        return;
      }

      // Create CSV content with selected columns
      const headers = selectedCols.map(col => csvColumnConfig[col].label);
      const rows = detailedApplicantData.map(app => 
        selectedCols.map(col => csvColumnConfig[col].getValue(app))
      );

      const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `applicants_export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting CSV:', error);
      alert('Failed to export data');
    }
  }, [selectedApplicants, token, csvExportColumns, cohortNameMap]);

  // Optimized filter update handlers
  const handleColumnToggle = useCallback((column, checked) => {
    setVisibleColumns(prev => ({ ...prev, [column]: checked }));
  }, [setVisibleColumns]);

  // Toggle a value in a multi-select filter array
  const handleFilterToggle = useCallback((filterKey, value) => {
    setApplicationFilters(prev => {
      const current = prev[filterKey] || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [filterKey]: next, offset: 0 };
    });
    onPageChange(1);
  }, [setApplicationFilters, onPageChange]);

  const handleClearFilter = useCallback((filterKey) => {
    setApplicationFilters(prev => ({ ...prev, [filterKey]: [], offset: 0 }));
    onPageChange(1);
  }, [setApplicationFilters, onPageChange]);

  const handleClearAllFilters = useCallback(() => {
    setApplicationFilters(prev => ({
      ...prev,
      status: [],
      final_status: [],
      info_session_status: [],
      workshop_status: [],
      program_admission_status: [],
      enrollment_status: [],
      source_bucket: [],
      account_age_bucket: [],
      application_age_bucket: [],
      last_activity_bucket: [],
      structured_task_grade: [],
      deliberation: [],
      pledge_completed: [],
      gja_signed: [],
      offset: 0
    }));
    onPageChange(1);
    // Clear sessionStorage
    try {
      sessionStorage.removeItem('admissions-dashboard-filters-v1');
    } catch (error) {
      console.error('Error clearing sessionStorage:', error);
    }
  }, [setApplicationFilters, onPageChange]);

  // Render sort indicator
  const renderSortIndicator = (column) => {
    if (columnSort.column !== column) {
      return <span className="text-gray-400 ml-1">⇅</span>;
    }
    return <span className="text-[#4242ea] ml-1">{columnSort.direction === 'asc' ? '▲' : '▼'}</span>;
  };

  // Render sortable + filterable column header (multi-select)
  const renderSortableFilterableHeader = (column, filterKey, label, sortKey = null) => {
    const options = filterOptions[filterKey];
    const currentValues = applicationFilters[filterKey] || [];
    const isFiltered = currentValues.length > 0;
    const isSortable = sortKey !== null;
    const isSorted = columnSort.column === sortKey;

    return (
      <div className="flex items-center gap-1">
        {/* Sortable label */}
        {isSortable ? (
          <span
            className="cursor-pointer hover:text-[#4242ea] font-proxima-bold select-none flex items-center"
            onClick={() => handleColumnSort(sortKey)}
          >
            {label}
            {isSorted ? (
              <span className="text-[#4242ea] ml-1">{columnSort.direction === 'asc' ? '▲' : '▼'}</span>
            ) : (
              <span className="text-gray-400 ml-1">⇅</span>
            )}
          </span>
        ) : (
          <span className="font-proxima-bold">{label}</span>
        )}

        {/* Filter dropdown (multi-select) */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <button
              className={`relative p-1 rounded hover:bg-gray-200 ${isFiltered ? 'text-[#4242ea]' : 'text-gray-400'}`}
              onClick={(e) => e.stopPropagation()}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
              </svg>
              {isFiltered && (
                <span className="absolute -top-1 -right-1 bg-[#4242ea] text-white text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {currentValues.length}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44 font-proxima">
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Filter by {label}</div>
            <DropdownMenuSeparator />
            {options.filter(opt => opt.value !== '').map((option) => (
              <DropdownMenuCheckboxItem
                key={option.value}
                checked={currentValues.includes(option.value)}
                onCheckedChange={() => handleFilterToggle(filterKey, option.value)}
                onSelect={(e) => e.preventDefault()}
              >
                {option.label}
              </DropdownMenuCheckboxItem>
            ))}
            {isFiltered && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="cursor-pointer text-red-600 hover:text-red-700"
                  onSelect={(e) => {
                    e.preventDefault();
                    handleClearFilter(filterKey);
                  }}
                >
                  ✕ Clear Filter
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  // Loading state - Skeleton UI
  if (loading) {
    return (
      <div className="flex flex-col h-full">
        {/* Controls Skeleton */}
        <div className="flex flex-wrap items-center gap-3 bg-white p-4 border-b border-gray-200 shrink-0">
          {/* Search skeleton */}
          <div className="w-[300px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
          
          {/* Cohort filter skeleton */}
          <div className="w-[200px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
          
          {/* Columns button skeleton */}
          <div className="w-[100px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
          
          {/* Actions button skeleton */}
          <div className="w-[110px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
          
          {/* Export button skeleton */}
          <div className="w-[130px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
          
          {/* Refresh button skeleton */}
          <div className="w-[90px] h-10 bg-gray-200 rounded-md animate-pulse"></div>
        </div>

        {/* Table Skeleton - Using actual Table components for proper structure */}
        <div className="flex-1 bg-white overflow-auto">
          <Table className="w-full">
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-12">
                  <div className="h-4 w-4 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-24 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-40 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-28 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-20 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-28 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-32 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-28 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-32 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-28 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
                <TableHead>
                  <div className="h-4 w-32 bg-gray-300 rounded animate-pulse"></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...Array(10)].map((_, index) => (
                <TableRow key={index} className="animate-pulse">
                  {/* Checkbox */}
                  <TableCell>
                    <div className="h-4 w-4 bg-gray-200 rounded"></div>
                  </TableCell>
                  {/* Name */}
                  <TableCell>
                    <div className="h-4 w-32 bg-gray-200 rounded"></div>
                  </TableCell>
                  {/* Email */}
                  <TableCell>
                    <div className="h-4 w-48 bg-gray-200 rounded"></div>
                  </TableCell>
                  {/* Phone */}
                  <TableCell>
                    <div className="h-4 w-28 bg-gray-200 rounded"></div>
                  </TableCell>
                  {/* Status Badge */}
                  <TableCell>
                    <div className="h-6 w-20 bg-gray-200 rounded-full"></div>
                  </TableCell>
                  {/* Assessment Badge */}
                  <TableCell>
                    <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
                  </TableCell>
                  {/* Info Session Badge */}
                  <TableCell>
                    <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
                  </TableCell>
                  {/* Workshop Badge */}
                  <TableCell>
                    <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
                  </TableCell>
                  {/* Workshop Grade */}
                  <TableCell>
                    <div className="h-4 w-12 bg-gray-200 rounded"></div>
                  </TableCell>
                  {/* Admission Badge */}
                  <TableCell>
                    <div className="h-6 w-24 bg-gray-200 rounded-full"></div>
                  </TableCell>
                  {/* Deliberation Select */}
                  <TableCell>
                    <div className="h-8 w-[100px] bg-gray-200 rounded-md"></div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Footer Skeleton */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center justify-between">
            <div className="w-48 h-5 bg-gray-300 rounded animate-pulse"></div>
            <div className="flex items-center gap-1">
              {/* Prev button */}
              <div className="w-20 h-8 bg-gray-300 rounded animate-pulse"></div>
              {/* Page numbers */}
              {[...Array(5)].map((_, i) => (
                <div key={i} className="w-8 h-8 bg-gray-300 rounded animate-pulse"></div>
              ))}
              {/* Next button */}
              <div className="w-20 h-8 bg-gray-300 rounded animate-pulse"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 bg-white p-4 border-b border-gray-200 shrink-0">
        {/* Search all applicants -- uses full search index when typing, paginated data when empty */}
        <div className="relative w-[300px]">
          <Input
            type="text"
            placeholder="Search by name, email, or phone..."
            value={tableSearchTerm}
            onChange={(e) => setTableSearchTerm(e.target.value)}
            className="w-full font-proxima pr-8"
          />
          {tableSearchTerm && (
            <button
              onClick={() => setTableSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
          {!tableSearchTerm && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
            </div>
          )}
        </div>

        {/* Cohort Filter */}
        <Select
          value={applicationFilters.cohort_id || '_all'}
          onValueChange={(value) => {
            setApplicationFilters(prev => ({ ...prev, cohort_id: value === '_all' ? '' : value, offset: 0 }));
            onPageChange(1);
          }}
        >
          <SelectTrigger className="w-[200px] bg-white font-proxima">
            <SelectValue placeholder="Cohort: All Time" />
          </SelectTrigger>
          <SelectContent className="font-proxima">
            <SelectItem value="_all">Cohort: All Time</SelectItem>
            {cohorts.map(cohort => (
              <SelectItem key={cohort.cohort_id} value={cohort.cohort_id}>
                {cohort.name}
              </SelectItem>
            ))}
            <SelectItem value="deferred">Deferred Applications</SelectItem>
          </SelectContent>
        </Select>

        {/* Move selected applicants to cohort */}
        <Select value={targetCohortId || '_none'} onValueChange={(value) => setTargetCohortId(value === '_none' ? '' : value)}>
          <SelectTrigger className="w-[210px] bg-white font-proxima">
            <SelectValue placeholder="Move selected to cohort..." />
          </SelectTrigger>
          <SelectContent className="font-proxima">
            <SelectItem value="_none">Move selected to cohort...</SelectItem>
            {cohorts.map((cohort) => (
              <SelectItem key={`move-${cohort.cohort_id}`} value={cohort.cohort_id}>
                {cohort.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          className="font-proxima"
          disabled={selectedApplicants.length === 0 || !targetCohortId || movingCohort}
          onClick={handleMoveSelectedToCohort}
        >
          {movingCohort ? 'Moving...' : `Move Selected (${selectedApplicants.length})`}
        </Button>

        {/* Columns Toggle */}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="font-proxima">
              ⚙️ Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 font-proxima max-h-[400px] overflow-y-auto">
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Show/Hide Columns</div>
            <DropdownMenuSeparator />
            {Object.keys(visibleColumns).map(column => (
              <DropdownMenuCheckboxItem
                key={column}
                checked={visibleColumns[column]}
                onCheckedChange={(checked) => handleColumnToggle(column, checked)}
                onSelect={(e) => e.preventDefault()}
              >
                {columnLabels[column] || getColumnLabel(column)}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Bulk Actions */}
        <Button
          variant="default"
          className="bg-[#4242ea] hover:bg-[#3333d1] font-proxima"
          disabled={selectedApplicants.length === 0}
          onClick={() => setBulkActionsModalOpen(true)}
        >
          Actions ({selectedApplicants.length})
        </Button>

        {/* Export CSV with Column Selection Dropdown */}
        <DropdownMenu modal={false} onOpenChange={(open) => { if (open) initializeCsvColumnsFromVisible(); }}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="font-proxima"
              disabled={selectedApplicants.length === 0}
            >
              Export CSV ({selectedApplicants.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 font-proxima max-h-[400px] overflow-y-auto" align="start">
            <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">
              Select Columns to Export
            </div>
            <DropdownMenuSeparator />
            {Object.entries(csvColumnConfig).map(([key, config]) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={csvExportColumns[key]}
                onCheckedChange={(checked) => setCsvExportColumns(prev => ({ ...prev, [key]: checked }))}
                onSelect={(e) => e.preventDefault()}
              >
                {config.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  setCsvExportColumns(Object.fromEntries(Object.keys(csvColumnConfig).map(k => [k, true])));
                }}
                className="font-proxima text-xs flex-1"
              >
                All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  setCsvExportColumns(Object.fromEntries(Object.keys(csvColumnConfig).map(k => [k, false])));
                }}
                className="font-proxima text-xs flex-1"
              >
                None
              </Button>
            </div>
            <DropdownMenuSeparator />
            <div className="p-2">
              <Button
                onClick={handleExportCSV}
                className="w-full bg-[#4242ea] hover:bg-[#3333d1] font-proxima"
              >
                Download CSV
              </Button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh */}
        <Button variant="outline" onClick={fetchApplications} className="font-proxima">
          Refresh
        </Button>

        {/* Active Filters Indicator */}
        {(applicationFilters.status?.length > 0 || applicationFilters.final_status?.length > 0 || applicationFilters.info_session_status?.length > 0 || applicationFilters.workshop_status?.length > 0 || applicationFilters.program_admission_status?.length > 0 || applicationFilters.enrollment_status?.length > 0 || applicationFilters.source_bucket?.length > 0 || applicationFilters.account_age_bucket?.length > 0 || applicationFilters.application_age_bucket?.length > 0 || applicationFilters.last_activity_bucket?.length > 0 || applicationFilters.structured_task_grade?.length > 0 || applicationFilters.deliberation?.length > 0 || applicationFilters.pledge_completed?.length > 0 || applicationFilters.gja_signed?.length > 0) && (
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <span className="text-sm text-gray-500 font-proxima">Active filters:</span>
            {applicationFilters.status?.length > 0 && (
              <Badge className="bg-blue-100 text-blue-700 font-proxima cursor-pointer hover:bg-blue-200" onClick={() => handleClearFilter('status')}>
                Status: {applicationFilters.status.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.final_status?.length > 0 && (
              <Badge className="bg-indigo-100 text-indigo-700 font-proxima cursor-pointer hover:bg-indigo-200" onClick={() => handleClearFilter('final_status')}>
                Assessment: {applicationFilters.final_status.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.info_session_status?.length > 0 && (
              <Badge className="bg-purple-100 text-purple-700 font-proxima cursor-pointer hover:bg-purple-200" onClick={() => handleClearFilter('info_session_status')}>
                Info Session: {applicationFilters.info_session_status.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.workshop_status?.length > 0 && (
              <Badge className="bg-green-100 text-green-700 font-proxima cursor-pointer hover:bg-green-200" onClick={() => handleClearFilter('workshop_status')}>
                Workshop: {applicationFilters.workshop_status.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.structured_task_grade?.length > 0 && (
              <Badge className="bg-gray-100 text-gray-700 font-proxima cursor-pointer hover:bg-gray-200" onClick={() => handleClearFilter('structured_task_grade')}>
                Workshop Grade: {applicationFilters.structured_task_grade.map(v => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.program_admission_status?.length > 0 && (
              <Badge className="bg-yellow-100 text-yellow-700 font-proxima cursor-pointer hover:bg-yellow-200" onClick={() => handleClearFilter('program_admission_status')}>
                Offer Extended: {applicationFilters.program_admission_status.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.enrollment_status?.length > 0 && (
              <Badge className="bg-emerald-100 text-emerald-700 font-proxima cursor-pointer hover:bg-emerald-200" onClick={() => handleClearFilter('enrollment_status')}>
                Offer Accepted: {applicationFilters.enrollment_status.map(formatEnrollmentStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.source_bucket?.length > 0 && (
              <Badge className="bg-slate-100 text-slate-700 font-proxima cursor-pointer hover:bg-slate-200" onClick={() => handleClearFilter('source_bucket')}>
                Source: {applicationFilters.source_bucket.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.account_age_bucket?.length > 0 && (
              <Badge className="bg-cyan-100 text-cyan-700 font-proxima cursor-pointer hover:bg-cyan-200" onClick={() => handleClearFilter('account_age_bucket')}>
                Account Age: {applicationFilters.account_age_bucket.join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.application_age_bucket?.length > 0 && (
              <Badge className="bg-violet-100 text-violet-700 font-proxima cursor-pointer hover:bg-violet-200" onClick={() => handleClearFilter('application_age_bucket')}>
                App Age: {applicationFilters.application_age_bucket.join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.last_activity_bucket?.length > 0 && (
              <Badge className="bg-teal-100 text-teal-700 font-proxima cursor-pointer hover:bg-teal-200" onClick={() => handleClearFilter('last_activity_bucket')}>
                Last Activity: {applicationFilters.last_activity_bucket.join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.deliberation?.length > 0 && (
              <Badge className="bg-orange-100 text-orange-700 font-proxima cursor-pointer hover:bg-orange-200" onClick={() => handleClearFilter('deliberation')}>
                Deliberation: {applicationFilters.deliberation.map(formatStatus).join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.pledge_completed?.length > 0 && (
              <Badge className="bg-lime-100 text-lime-700 font-proxima cursor-pointer hover:bg-lime-200" onClick={() => handleClearFilter('pledge_completed')}>
                Pledge: {applicationFilters.pledge_completed.map(v => v === 'true' ? 'Signed' : 'Not Signed').join(', ')} ✕
              </Badge>
            )}
            {applicationFilters.gja_signed?.length > 0 && (
              <Badge className="bg-rose-100 text-rose-700 font-proxima cursor-pointer hover:bg-rose-200" onClick={() => handleClearFilter('gja_signed')}>
                GJA: {applicationFilters.gja_signed.map(v => v === 'true' ? 'Signed' : 'Not Signed').join(', ')} ✕
              </Badge>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-red-600 hover:text-red-700 hover:bg-red-50 font-proxima h-6 px-2"
              onClick={handleClearAllFilters}
            >
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Table */}
      {applications?.applications?.length > 0 ? (
        <div className="flex-1 bg-white overflow-hidden flex flex-col">
          {/* Scrollable table container */}
          <div className="flex-1 overflow-auto relative">
            <Table className="w-full min-w-max">
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedApplicants.length === sortedApplications?.length && sortedApplications?.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                  {visibleColumns.name && (
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-100 font-proxima-bold"
                      onClick={() => handleColumnSort('name')}
                    >
                      <div className="flex items-center">
                        Name {renderSortIndicator('name')}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.email && (
                    <TableHead className="font-proxima-bold">Email</TableHead>
                  )}
                  {visibleColumns.phone && (
                    <TableHead className="font-proxima-bold">Phone</TableHead>
                  )}
                  {visibleColumns.app_start_date && (
                    <TableHead 
                      className="cursor-pointer hover:bg-gray-100 font-proxima-bold"
                      onClick={() => handleColumnSort('created_at')}
                    >
                      <div className="flex items-center">
                        App Start Date {renderSortIndicator('created_at')}
                      </div>
                    </TableHead>
                  )}
                  {visibleColumns.status && (
                    <TableHead>
                      {renderSortableFilterableHeader('status', 'status', 'Status', 'status')}
                    </TableHead>
                  )}
                {visibleColumns.assessment && (
                  <TableHead>
                    {renderSortableFilterableHeader('assessment', 'final_status', 'Assessment', null)}
                  </TableHead>
                )}
                  {visibleColumns.info_session && (
                    <TableHead>
                      {renderSortableFilterableHeader('info_session', 'info_session_status', 'Info Session', 'info_session_status')}
                    </TableHead>
                  )}
                  {visibleColumns.workshop && (
                    <TableHead>
                      {renderSortableFilterableHeader('workshop', 'workshop_status', 'Workshop', 'workshop_status')}
                    </TableHead>
                  )}
                  {visibleColumns.structured_task_grade && (
                    <TableHead>
                      {renderSortableFilterableHeader('structured_task_grade', 'structured_task_grade', 'Workshop Grade', null)}
                    </TableHead>
                  )}
                  {visibleColumns.admission && (
                    <TableHead>
                      {renderSortableFilterableHeader('admission', 'program_admission_status', 'Offer Extended', 'program_admission_status')}
                    </TableHead>
                  )}
                  {visibleColumns.enrollment && (
                    <TableHead>
                      {renderSortableFilterableHeader('enrollment', 'enrollment_status', 'Offer Accepted', 'enrollment_status')}
                    </TableHead>
                  )}
                  {visibleColumns.cohort && (
                    <TableHead className="font-proxima-bold">Cohort</TableHead>
                  )}
                  {visibleColumns.source_bucket && (
                    <TableHead>
                      {renderSortableFilterableHeader('source_bucket', 'source_bucket', 'Source', 'source_bucket')}
                    </TableHead>
                  )}
                  {visibleColumns.account_age_bucket && (
                    <TableHead>
                      {renderSortableFilterableHeader('account_age_bucket', 'account_age_bucket', 'Account Age', 'account_age_bucket')}
                    </TableHead>
                  )}
                  {visibleColumns.application_age_bucket && (
                    <TableHead>
                      {renderSortableFilterableHeader('application_age_bucket', 'application_age_bucket', 'Application Age', 'application_age_bucket')}
                    </TableHead>
                  )}
                  {visibleColumns.last_activity_bucket && (
                    <TableHead>
                      {renderSortableFilterableHeader('last_activity_bucket', 'last_activity_bucket', 'Last Activity', 'last_activity_bucket')}
                    </TableHead>
                  )}
                  {visibleColumns.deliberation && (
                    <TableHead>
                      {renderSortableFilterableHeader('deliberation', 'deliberation', 'Deliberation', 'deliberation')}
                    </TableHead>
                  )}
                  {visibleColumns.age && (
                    <TableHead className="font-proxima-bold">Age</TableHead>
                  )}
                  {visibleColumns.gender && (
                    <TableHead className="font-proxima-bold">Gender</TableHead>
                  )}
                  {visibleColumns.race && (
                    <TableHead className="font-proxima-bold">Race/Ethnicity</TableHead>
                  )}
                  {visibleColumns.education && (
                    <TableHead className="font-proxima-bold">Education</TableHead>
                  )}
                  {visibleColumns.referral && (
                    <TableHead className="font-proxima-bold">Referral</TableHead>
                  )}
                  {visibleColumns.referral_detail && (
                    <TableHead className="font-proxima-bold">Referral Detail</TableHead>
                  )}
                  {visibleColumns.referral_channel && (
                    <TableHead className="font-proxima-bold">Referral Channel</TableHead>
                  )}
                  {visibleColumns.pledge && (
                    <TableHead className="font-proxima-bold">
                      {renderSortableFilterableHeader('pledge', 'pledge_completed', 'Pledge', null)}
                    </TableHead>
                  )}
                  {visibleColumns.gja && (
                    <TableHead className="font-proxima-bold">
                      {renderSortableFilterableHeader('gja', 'gja_signed', 'GJA', null)}
                    </TableHead>
                  )}
                  {visibleColumns.income && (
                    <TableHead className="font-proxima-bold">Pre-Program Income</TableHead>
                  )}

                  {visibleColumns.notes && (
                    <TableHead className="font-proxima-bold">Notes</TableHead>
                  )}

                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedApplications.map((app) => (
                  <ApplicationRow
                    key={app.applicant_id}
                    app={app}
                    visibleColumns={visibleColumns}
                    isSelected={selectedApplicants.includes(app.applicant_id)}
                    onSelect={handleSelectApplicant}
                    onViewApplication={handleViewApplication}
                    onOpenNotes={openNotesModal}
                    onDeliberationChange={handleDeliberationChange}
                    onViewGja={openGjaModal}
                    cohortNameMap={cohortNameMap}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 font-proxima text-lg">No applicants found</p>
            <p className="text-gray-400 font-proxima text-sm mt-1">Try adjusting your filters</p>
            {(applicationFilters.status?.length > 0 || applicationFilters.final_status?.length > 0 || applicationFilters.info_session_status?.length > 0 || applicationFilters.workshop_status?.length > 0 || applicationFilters.program_admission_status?.length > 0 || applicationFilters.enrollment_status?.length > 0 || applicationFilters.source_bucket?.length > 0 || applicationFilters.account_age_bucket?.length > 0 || applicationFilters.application_age_bucket?.length > 0 || applicationFilters.last_activity_bucket?.length > 0 || applicationFilters.structured_task_grade?.length > 0 || applicationFilters.deliberation?.length > 0 || applicationFilters.pledge_completed?.length > 0 || applicationFilters.gja_signed?.length > 0) && (
              <Button
                variant="outline"
                className="mt-4 font-proxima"
                onClick={handleClearAllFilters}
              >
                Clear All Filters
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Footer with Pagination, Load All, or Search Results count */}
      {(applications?.applications?.length > 0 || isSearching) && (
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          {isSearching ? (
            /* Search Mode - Show match count and clear button */
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 font-proxima">
                Found {sortedApplications.length} matching applicant{sortedApplications.length !== 1 ? 's' : ''}
              </span>
              <Button
                variant="outline"
                onClick={() => setTableSearchTerm('')}
                className="font-proxima"
              >
                ✕ Clear Search
              </Button>
            </div>
          ) : loadAllMode ? (
            /* Load All Mode - Show count and return button */
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600 font-proxima">
                Showing all {totalItems} applicants
              </span>
              <Button
                variant="outline"
                onClick={onReturnToPagination}
                className="font-proxima"
              >
                ← Back to Paginated View
              </Button>
            </div>
          ) : (
            /* Normal Mode - Show pagination and Load All button */
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={onPageChange}
                />
              </div>
              {totalItems > pageSize && (
                <Button
                  variant="outline"
                  onClick={onLoadAll}
                  className="font-proxima ml-4"
                >
                  Load All {totalItems} Applicants
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Good Jobs Agreement viewer */}
      <Dialog
        open={gjaModalOpen}
        onOpenChange={(open) => {
          setGjaModalOpen(open);
          if (!open) revokeGjaObjectUrl();
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="font-proxima">{gjaTitle || 'Good Jobs Agreement'}</DialogTitle>
            <DialogDescription className="font-proxima">Signed Good Jobs Agreement</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {gjaLoading ? (
              <div className="flex items-center justify-center p-8 font-proxima text-gray-600">
                Loading document…
              </div>
            ) : gjaError ? (
              <div className="border border-red-200 bg-red-50 text-red-800 rounded-md p-3 font-proxima text-sm">
                {gjaError}
              </div>
            ) : gjaFileType === 'image' && gjaContent ? (
              <div className="flex justify-center">
                <img src={gjaContent} alt={gjaTitle} className="max-w-full max-h-[60vh] object-contain" />
              </div>
            ) : gjaFileType === 'pdf' && gjaContent ? (
              <div className="flex justify-center">
                <iframe src={gjaContent} className="w-full h-[60vh]" title={gjaTitle} />
              </div>
            ) : null}
          </div>
          {gjaOpenUrl && (
            <div className="flex justify-center pt-4">
              <Button
                asChild
                variant="outline"
                className="border-[#4242EA] text-[#4242EA] hover:bg-[#4242EA] hover:text-white font-proxima"
              >
                <a href={gjaOpenUrl} target="_blank" rel="noopener noreferrer">
                  Open in new tab
                </a>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default ApplicationsTab;
