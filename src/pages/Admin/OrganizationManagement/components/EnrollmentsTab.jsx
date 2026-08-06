import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import Swal from 'sweetalert2';
import { Button } from '../../../../components/ui/button';
import { Input } from '../../../../components/ui/input';
import { Label } from '../../../../components/ui/label';
import { Textarea } from '../../../../components/ui/textarea';
import { Badge } from '../../../../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../../../../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../../../components/ui/table';
import { Pencil, Trash2, Plus, Users, Search, Download, X, ArrowRight, Check } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// Statuses that mean "no longer in this cohort". Kept in step with EXITED_STATUSES in
// queries/organizationManagement.js — the server FORCES is_active = false for these and a DB
// constraint (user_enrollment_exit_not_active) forbids the combination outright.
const EXIT_STATUSES = ['withdrawn', 'dismissed'];
const isExitStatus = (status) => EXIT_STATUSES.includes(status);

function EnrollmentsTab({ token, setLoading }) {
  const [allEnrollments, setAllEnrollments] = useState([]); // Store all enrollments
  const [cohorts, setCohorts] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [cohortFilter, setCohortFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEnrollment, setEditingEnrollment] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const userSearchRef = useRef(null);
  const dropdownRef = useRef(null);
  // Bulk dialog state
  const [isBulkDialogOpen, setIsBulkDialogOpen] = useState(false);
  const [bulkStep, setBulkStep] = useState(1);
  const [sourceCohortId, setSourceCohortId] = useState('');
  const [destinationCohortId, setDestinationCohortId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [bulkBuilderSearch, setBulkBuilderSearch] = useState('');
  const [bulkFormData, setBulkFormData] = useState({
    enrolled_date: new Date().toISOString().split('T')[0],
    status: 'in_progress',
    is_active: false,
    notes: ''
  });

  const [formData, setFormData] = useState({
    user_id: '',
    cohort_id: '',
    enrolled_date: new Date().toISOString().split('T')[0],
    status: 'in_progress',
    is_active: true,
    completion_date: '',
    withdrawal_date: '',
    withdrawal_reason: '',
    notes: ''
  });

  useEffect(() => {
    fetchEnrollments();
    fetchCohorts();
    fetchUsers();
  }, []); // Only fetch on mount

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        userSearchRef.current && !userSearchRef.current.contains(e.target)
      ) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchEnrollments = async () => {
    try {
      setLoading(true);
      
      // Fetch ALL enrollments without any filters
      const response = await axios.get(
        `${API_URL}/api/admin/organization-management/enrollments`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAllEnrollments(response.data.enrollments || []);
    } catch (error) {
      console.error('Error fetching enrollments:', error);
      
      // Check for specific error codes
      if (error.response?.data?.code === 'TABLE_NOT_EXISTS' || error.response?.data?.code === 'SCHEMA_MISMATCH') {
        Swal.fire({
          icon: 'warning',
          title: 'Enrollment System Not Available',
          html: `
            <p>${error.response.data.error}</p>
            <br/>
            <p class="text-sm text-gray-600">
              The enrollment management system requires database migration 050 to be run.
              Please contact your system administrator.
            </p>
          `,
          confirmButtonColor: '#4242EA'
        });
        setAllEnrollments([]);
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Error',
          text: error.response?.data?.error || 'Failed to fetch enrollments',
          confirmButtonColor: '#4242EA'
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchCohorts = async () => {
    try {
      // Get unique cohorts from the enrollments we already have
      const response = await axios.get(
        `${API_URL}/api/admin/organization-management/cohorts`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCohorts(response.data.cohorts || []);
    } catch (error) {
      console.error('Error fetching cohorts:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await axios.get(
        `${API_URL}/api/users?limit=10000`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setAllUsers(response.data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const filteredUsers = allUsers.filter(user => {
    if (!userSearchQuery.trim()) return false;
    const q = userSearchQuery.toLowerCase();
    return (
      user.first_name?.toLowerCase().includes(q) ||
      user.last_name?.toLowerCase().includes(q) ||
      user.email?.toLowerCase().includes(q) ||
      `${user.first_name} ${user.last_name}`.toLowerCase().includes(q)
    );
  });

  const handleSelectUser = (user) => {
    setSelectedUser(user);
    setFormData({ ...formData, user_id: user.user_id });
    setUserSearchQuery(`${user.first_name} ${user.last_name} (${user.email})`);
    setShowUserDropdown(false);
  };

  const handleClearUser = () => {
    setSelectedUser(null);
    setFormData({ ...formData, user_id: '' });
    setUserSearchQuery('');
  };

  const handleCreate = () => {
    setEditingEnrollment(null);
    setSelectedUser(null);
    setUserSearchQuery('');
    setFormData({
      user_id: '',
      cohort_id: '',
      enrolled_date: new Date().toISOString().split('T')[0],
      status: 'in_progress',
      is_active: true,
      completion_date: '',
      withdrawal_date: '',
      withdrawal_reason: '',
      notes: ''
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (enrollment) => {
    setEditingEnrollment(enrollment);
    setSelectedUser({ user_id: enrollment.user_id, first_name: enrollment.first_name, last_name: enrollment.last_name, email: enrollment.user_email });
    setUserSearchQuery(`${enrollment.first_name} ${enrollment.last_name} (${enrollment.user_email})`);
    setFormData({
      user_id: enrollment.user_id,
      cohort_id: enrollment.cohort_id,
      enrolled_date: enrollment.enrolled_date ? new Date(enrollment.enrolled_date).toISOString().split('T')[0] : '',
      status: enrollment.status || 'in_progress',
      is_active: enrollment.is_active !== false,
      completion_date: enrollment.completion_date ? new Date(enrollment.completion_date).toISOString().split('T')[0] : '',
      withdrawal_date: enrollment.withdrawal_date ? new Date(enrollment.withdrawal_date).toISOString().split('T')[0] : '',
      withdrawal_reason: enrollment.withdrawal_reason || '',
      notes: enrollment.notes || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (enrollment) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `Delete enrollment for ${enrollment.user_email}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EF4444',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel'
    });

    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      await axios.delete(
        `${API_URL}/api/admin/organization-management/enrollments/${enrollment.enrollment_id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      Swal.fire('Deleted!', 'Enrollment deleted successfully', 'success');
      fetchEnrollments();
    } catch (error) {
      console.error('Error deleting enrollment:', error);
      Swal.fire('Error', error.response?.data?.error || 'Failed to delete enrollment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const userId = selectedUser?.user_id || formData.user_id;
    const cohortId = formData.cohort_id;

    if (!userId || !cohortId) {
      setIsDialogOpen(false);
      Swal.fire('Error', 'User and Cohort are required', 'error');
      return;
    }

    try {
      setLoading(true);
      setIsDialogOpen(false);

      const payload = {
        user_id: parseInt(userId),
        cohort_id: cohortId,
        enrolled_date: formData.enrolled_date,
        status: formData.status,
        // The effective value, not the raw state: disabling the checkbox does not clear
        // formData.is_active, so ticking Active and THEN choosing Withdrawn would still have sent
        // true. The edit path survives that (the server forces it), but createEnrollment would
        // have tried to INSERT withdrawn-and-active and been rejected by the DB constraint.
        is_active: isExitStatus(formData.status) ? false : formData.is_active,
        notes: formData.notes,
        completion_date: formData.completion_date || null,
        withdrawal_date: formData.withdrawal_date || null,
        withdrawal_reason: formData.withdrawal_reason || null
      };

      if (editingEnrollment) {
        await axios.put(
          `${API_URL}/api/admin/organization-management/enrollments/${editingEnrollment.enrollment_id}`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        Swal.fire('Success', 'Enrollment updated successfully', 'success');
      } else {
        await axios.post(
          `${API_URL}/api/admin/organization-management/enrollments`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        Swal.fire('Success', 'Enrollment created successfully', 'success');
      }

      fetchEnrollments();
    } catch (error) {
      console.error('Error saving enrollment:', error);
      Swal.fire('Error', error.response?.data?.error || 'Failed to save enrollment', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setLoading(true);
      
      // Use the filtered enrollments for export
      const params = new URLSearchParams();
      if (cohortFilter !== 'all') params.append('cohort_id', cohortFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (activeFilter !== 'all') params.append('is_active', activeFilter);
      
      const response = await axios.get(
        `${API_URL}/api/admin/organization-management/enrollments/export?${params}`,
        { 
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob'
        }
      );
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `enrollments_${Date.now()}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      
      Swal.fire('Success', 'Enrollments exported successfully', 'success');
    } catch (error) {
      console.error('Error exporting enrollments:', error);
      Swal.fire('Error', 'Failed to export enrollments', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Bulk dialog handlers
  const handleBulkOpen = () => {
    setIsBulkDialogOpen(true);
    setBulkStep(1);
    setSourceCohortId('');
    setDestinationCohortId('');
    setSelectedUserIds([]);
    setBulkBuilderSearch('');
    setBulkFormData({
      enrolled_date: new Date().toISOString().split('T')[0],
      status: 'in_progress',
      is_active: false,
      notes: ''
    });
  };

  const sourceCohortBuilders = (() => {
    if (!sourceCohortId) return [];
    const seen = new Set();
    return allEnrollments
      .filter(e => e.cohort_id?.toString() === sourceCohortId && e.is_active === true)
      .filter(e => {
        if (seen.has(e.user_id)) return false;
        seen.add(e.user_id);
        return true;
      });
  })();

  const filteredBulkBuilders = sourceCohortBuilders.filter(e => {
    if (!bulkBuilderSearch.trim()) return true;
    const q = bulkBuilderSearch.toLowerCase();
    return (
      e.first_name?.toLowerCase().includes(q) ||
      e.last_name?.toLowerCase().includes(q) ||
      e.user_email?.toLowerCase().includes(q)
    );
  });

  const destEnrolledUserIds = new Set(
    allEnrollments
      .filter(e => e.cohort_id?.toString() === destinationCohortId)
      .map(e => e.user_id)
  );

  const handleToggleUser = (userId) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    const visibleIds = filteredBulkBuilders.map(e => e.user_id);
    const allSelected = visibleIds.every(id => selectedUserIds.includes(id));
    if (allSelected) {
      setSelectedUserIds(prev => prev.filter(id => !visibleIds.includes(id)));
    } else {
      setSelectedUserIds(prev => [...new Set([...prev, ...visibleIds])]);
    }
  };

  const handleBulkSubmit = async () => {
    if (!destinationCohortId || selectedUserIds.length === 0) return;

    try {
      setLoading(true);
      setIsBulkDialogOpen(false);

      await axios.post(
        `${API_URL}/api/admin/organization-management/enrollments/bulk-create`,
        {
          user_ids: selectedUserIds.map(id => parseInt(id)),
          cohort_id: destinationCohortId,
          enrolled_date: bulkFormData.enrolled_date,
          status: bulkFormData.status,
          is_active: bulkFormData.is_active,
          source_cohort_id: sourceCohortId
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      Swal.fire('Success', `${selectedUserIds.length} enrollment(s) created successfully`, 'success');
      fetchEnrollments();
    } catch (error) {
      console.error('Error bulk creating enrollments:', error);
      Swal.fire('Error', error.response?.data?.error || 'Failed to create bulk enrollments', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredEnrollments = allEnrollments.filter(enrollment => {
    // Apply search filter
    const matchesSearch = enrollment.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.first_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.last_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      enrollment.cohort_name?.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (!matchesSearch) return false;
    
    // Apply cohort filter
    if (cohortFilter !== 'all' && enrollment.cohort_id?.toString() !== cohortFilter) {
      return false;
    }
    
    // Apply status filter
    if (statusFilter !== 'all' && enrollment.status !== statusFilter) {
      return false;
    }
    
    // Apply active filter
    if (activeFilter !== 'all') {
      const isActive = activeFilter === 'true';
      if (enrollment.is_active !== isActive) {
        return false;
      }
    }
    
    return true;
  });

  const getStatusBadge = (status) => {
    const badges = {
      'in_progress': { label: 'In Progress', color: 'bg-blue-100 text-blue-800' },
      'completed': { label: 'Completed', color: 'bg-green-100 text-green-800' },
      'withdrawn': { label: 'Withdrawn', color: 'bg-red-100 text-red-800' },
      'deferred': { label: 'Deferred', color: 'bg-yellow-100 text-yellow-800' }
    };
    
    const badge = badges[status] || badges.in_progress;
    return (
      <Badge className={`${badge.color} hover:${badge.color} font-proxima`}>
        {badge.label}
      </Badge>
    );
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-[#4242EA]" />
          <h2 className="text-xl font-bold text-slate-900 font-proxima">Enrollments</h2>
          <Badge variant="secondary" className="font-proxima">
            {filteredEnrollments.length} total
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleExport}
            variant="outline"
            className="font-proxima"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button
            onClick={handleBulkOpen}
            variant="outline"
            className="font-proxima"
          >
            <Users className="h-4 w-4 mr-2" />
            Bulk Add Enrollments
          </Button>
          <Button
            onClick={handleCreate}
            className="bg-[#4242EA] hover:bg-[#3535BA] text-white font-proxima"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Enrollment
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <div className="col-span-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 font-proxima"
          />
        </div>
        
        <Select value={cohortFilter} onValueChange={setCohortFilter}>
          <SelectTrigger className="font-proxima">
            <SelectValue placeholder="All Cohorts" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-proxima">All Cohorts</SelectItem>
            {cohorts.map(cohort => (
              <SelectItem key={cohort.cohort_id} value={cohort.cohort_id.toString()} className="font-proxima">
                {cohort.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="font-proxima">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-proxima">All Statuses</SelectItem>
            <SelectItem value="in_progress" className="font-proxima">In Progress</SelectItem>
            <SelectItem value="completed" className="font-proxima">Completed</SelectItem>
            <SelectItem value="withdrawn" className="font-proxima">Withdrawn</SelectItem>
            <SelectItem value="dismissed" className="font-proxima">Dismissed</SelectItem>
            <SelectItem value="deferred" className="font-proxima">Deferred</SelectItem>
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="font-proxima">
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="font-proxima">All</SelectItem>
            <SelectItem value="true" className="font-proxima">Active Only</SelectItem>
            <SelectItem value="false" className="font-proxima">Inactive Only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-proxima font-semibold">User</TableHead>
              <TableHead className="font-proxima font-semibold">Cohort</TableHead>
              <TableHead className="font-proxima font-semibold">Organization</TableHead>
              <TableHead className="font-proxima font-semibold text-center">Status</TableHead>
              <TableHead className="font-proxima font-semibold">Enrolled</TableHead>
              <TableHead className="font-proxima font-semibold text-center">Active</TableHead>
              <TableHead className="font-proxima font-semibold text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredEnrollments.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-slate-500 font-proxima">
                  No enrollments found
                </TableCell>
              </TableRow>
            ) : (
              filteredEnrollments.map((enrollment) => (
                <TableRow key={enrollment.enrollment_id} className="hover:bg-slate-50">
                  <TableCell className="font-proxima">
                    <div>
                      <div className="font-medium">{enrollment.first_name} {enrollment.last_name}</div>
                      <div className="text-xs text-slate-500">{enrollment.user_email}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-proxima">{enrollment.cohort_name}</TableCell>
                  <TableCell className="font-proxima text-sm">
                    {enrollment.organization_name || 'N/A'}
                  </TableCell>
                  <TableCell className="text-center">{getStatusBadge(enrollment.status)}</TableCell>
                  <TableCell className="font-proxima text-sm text-slate-600">
                    {enrollment.enrolled_date ? new Date(enrollment.enrolled_date).toLocaleDateString() : '—'}
                  </TableCell>
                  <TableCell className="text-center">
                    {enrollment.is_active ? (
                      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 font-proxima">
                        Active
                      </Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100 font-proxima">
                        Inactive
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(enrollment)}
                        className="hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(enrollment)}
                        className="hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-proxima text-xl">
              {editingEnrollment ? 'Edit Enrollment' : 'Create Enrollment'}
            </DialogTitle>
            <DialogDescription className="font-proxima">
              {editingEnrollment
                ? 'Update enrollment details below'
                : 'Fill in the details to create a new enrollment'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <Label htmlFor="user_search" className="font-proxima">
                    User <span className="text-red-500">*</span>
                  </Label>
                  {selectedUser ? (
                    <div className="flex items-center gap-2 mt-1 px-3 py-2 border rounded-md bg-slate-50">
                      <div className="flex-1 min-w-0">
                        <span className="font-proxima text-sm font-medium truncate block">
                          {selectedUser.first_name} {selectedUser.last_name}
                        </span>
                        <span className="font-proxima text-xs text-slate-500 truncate block">
                          {selectedUser.email}
                        </span>
                      </div>
                      {!editingEnrollment && (
                        <button
                          type="button"
                          onClick={handleClearUser}
                          className="text-slate-400 hover:text-slate-600 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        ref={userSearchRef}
                        id="user_search"
                        type="text"
                        value={userSearchQuery}
                        onChange={(e) => {
                          setUserSearchQuery(e.target.value);
                          setShowUserDropdown(true);
                        }}
                        onFocus={() => userSearchQuery.trim() && setShowUserDropdown(true)}
                        placeholder="Search by name or email..."
                        className="pl-10 font-proxima"
                        disabled={!!editingEnrollment}
                        autoComplete="off"
                      />
                      {showUserDropdown && filteredUsers.length > 0 && (
                        <div
                          ref={dropdownRef}
                          className="absolute z-50 top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-white border border-slate-200 rounded-md shadow-lg"
                        >
                          {filteredUsers.slice(0, 50).map(user => (
                            <button
                              key={user.user_id}
                              type="button"
                              onClick={() => handleSelectUser(user)}
                              className="w-full text-left px-3 py-2 hover:bg-slate-100 transition-colors"
                            >
                              <div className="font-proxima text-sm font-medium">
                                {user.first_name} {user.last_name}
                              </div>
                              <div className="font-proxima text-xs text-slate-500">
                                {user.email}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {showUserDropdown && userSearchQuery.trim() && filteredUsers.length === 0 && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg px-3 py-3 text-sm text-slate-500 font-proxima">
                          No users found
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <Label htmlFor="cohort_id" className="font-proxima">
                    Cohort <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.cohort_id.toString()}
                    onValueChange={(value) => setFormData({ ...formData, cohort_id: value })}
                    disabled={!!editingEnrollment}
                  >
                    <SelectTrigger className="font-proxima">
                      <SelectValue placeholder="Select cohort" />
                    </SelectTrigger>
                    <SelectContent>
                      {cohorts.map(cohort => (
                        <SelectItem key={cohort.cohort_id} value={cohort.cohort_id.toString()} className="font-proxima">
                          {cohort.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="enrolled_date" className="font-proxima">Enrolled Date</Label>
                  <Input
                    id="enrolled_date"
                    type="date"
                    value={formData.enrolled_date}
                    onChange={(e) => setFormData({ ...formData, enrolled_date: e.target.value })}
                    className="font-proxima"
                  />
                </div>

                <div>
                  <Label htmlFor="status" className="font-proxima">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger className="font-proxima">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress" className="font-proxima">In Progress</SelectItem>
                      <SelectItem value="completed" className="font-proxima">Completed</SelectItem>
                      <SelectItem value="withdrawn" className="font-proxima">Withdrawn</SelectItem>
            <SelectItem value="dismissed" className="font-proxima">Dismissed</SelectItem>
                      <SelectItem value="deferred" className="font-proxima">Deferred</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.status === 'completed' && (
                <div>
                  <Label htmlFor="completion_date" className="font-proxima">Completion Date</Label>
                  <Input
                    id="completion_date"
                    type="date"
                    value={formData.completion_date}
                    onChange={(e) => setFormData({ ...formData, completion_date: e.target.value })}
                    className="font-proxima"
                  />
                </div>
              )}

              {isExitStatus(formData.status) && (
                <>
                  <div>
                    <Label htmlFor="withdrawal_date" className="font-proxima">Withdrawal Date</Label>
                    <Input
                      id="withdrawal_date"
                      type="date"
                      value={formData.withdrawal_date}
                      onChange={(e) => setFormData({ ...formData, withdrawal_date: e.target.value })}
                      className="font-proxima"
                    />
                  </div>
                  <div>
                    <Label htmlFor="withdrawal_reason" className="font-proxima">Withdrawal Reason</Label>
                    <Textarea
                      id="withdrawal_reason"
                      value={formData.withdrawal_reason}
                      onChange={(e) => setFormData({ ...formData, withdrawal_reason: e.target.value })}
                      placeholder="Reason for withdrawal..."
                      rows={2}
                      className="font-proxima"
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="notes" className="font-proxima">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                  className="font-proxima"
                />
              </div>

              {/* This checkbox is why 39 enrollments ended up withdrawn AND active: the server only
                  defaulted is_active to false when the field was ABSENT, and this form always sent
                  it. Leaving "Active" ticked while setting status to Withdrawn produced a row that
                  every cohort count keying on is_active still counted — December 2025 L1 read 29
                  enrolled when 1 was. The server now forces it and a DB constraint forbids the
                  combination, so the box is disabled here rather than sending a value that is about
                  to be overridden. */}
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={isExitStatus(formData.status) ? false : formData.is_active}
                  disabled={isExitStatus(formData.status)}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="h-4 w-4 mt-0.5 text-[#4242EA] rounded disabled:opacity-50"
                />
                <div>
                  <Label htmlFor="is_active" className="font-proxima cursor-pointer">
                    Active enrollment (user's current active program)
                  </Label>
                  {isExitStatus(formData.status) && (
                    <p className="text-xs text-gray-500 font-proxima mt-1">
                      A {formData.status} enrollment is never active — the builder stops counting toward
                      this cohort's numbers. They keep their platform login and their history here.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                className="font-proxima"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#4242EA] hover:bg-[#3535BA] text-white font-proxima"
              >
                {editingEnrollment ? 'Update' : 'Create'} Enrollment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Add Enrollments Dialog */}
      <Dialog open={isBulkDialogOpen} onOpenChange={setIsBulkDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-proxima text-xl">
              Bulk Add Enrollments
            </DialogTitle>
            <DialogDescription className="font-proxima">
              {bulkStep === 1
                ? 'Step 1: Select a source cohort and choose builders to enroll'
                : 'Step 2: Select the destination cohort and confirm'}
            </DialogDescription>
          </DialogHeader>

          {bulkStep === 1 && (
            <div className="grid gap-4 py-4">
              <div>
                <Label className="font-proxima">
                  Source Cohort <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={sourceCohortId}
                  onValueChange={(value) => {
                    setSourceCohortId(value);
                    setSelectedUserIds([]);
                    setBulkBuilderSearch('');
                  }}
                >
                  <SelectTrigger className="font-proxima">
                    <SelectValue placeholder="Select source cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts.map(cohort => (
                      <SelectItem key={cohort.cohort_id} value={cohort.cohort_id.toString()} className="font-proxima">
                        {cohort.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {sourceCohortId && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-700 font-proxima">
                      {selectedUserIds.length} of {sourceCohortBuilders.length} selected
                    </span>
                    <div className="relative w-64">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="text"
                        placeholder="Search builders..."
                        value={bulkBuilderSearch}
                        onChange={(e) => setBulkBuilderSearch(e.target.value)}
                        className="pl-10 font-proxima"
                      />
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={filteredBulkBuilders.length > 0 && filteredBulkBuilders.every(e => selectedUserIds.includes(e.user_id))}
                              onChange={handleSelectAll}
                              className="h-4 w-4 text-[#4242EA] rounded"
                            />
                          </TableHead>
                          <TableHead className="font-proxima font-semibold">Builder</TableHead>
                          <TableHead className="font-proxima font-semibold">Email</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredBulkBuilders.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center py-6 text-slate-500 font-proxima">
                              No builders found in this cohort
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredBulkBuilders.map(enrollment => (
                            <TableRow
                              key={enrollment.user_id}
                              className="hover:bg-slate-50 cursor-pointer"
                              onClick={() => handleToggleUser(enrollment.user_id)}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedUserIds.includes(enrollment.user_id)}
                                  onChange={() => handleToggleUser(enrollment.user_id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-4 w-4 text-[#4242EA] rounded"
                                />
                              </TableCell>
                              <TableCell className="font-proxima font-medium">
                                {enrollment.first_name} {enrollment.last_name}
                              </TableCell>
                              <TableCell className="font-proxima text-sm text-slate-600">
                                {enrollment.user_email}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsBulkDialogOpen(false)}
                  className="font-proxima"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => setBulkStep(2)}
                  disabled={selectedUserIds.length === 0}
                  className="bg-[#4242EA] hover:bg-[#3535BA] text-white font-proxima"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {bulkStep === 2 && (
            <div className="grid gap-4 py-4">
              <div>
                <Label className="font-proxima">
                  Destination Cohort <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={destinationCohortId}
                  onValueChange={setDestinationCohortId}
                >
                  <SelectTrigger className="font-proxima">
                    <SelectValue placeholder="Select destination cohort" />
                  </SelectTrigger>
                  <SelectContent>
                    {cohorts
                      .filter(c => c.cohort_id.toString() !== sourceCohortId)
                      .map(cohort => (
                        <SelectItem key={cohort.cohort_id} value={cohort.cohort_id.toString()} className="font-proxima">
                          {cohort.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="font-proxima">Enrolled Date</Label>
                  <Input
                    type="date"
                    value={bulkFormData.enrolled_date}
                    onChange={(e) => setBulkFormData({ ...bulkFormData, enrolled_date: e.target.value })}
                    className="font-proxima"
                  />
                </div>
                <div>
                  <Label className="font-proxima">Status</Label>
                  <Select
                    value={bulkFormData.status}
                    onValueChange={(value) => setBulkFormData({ ...bulkFormData, status: value })}
                  >
                    <SelectTrigger className="font-proxima">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress" className="font-proxima">In Progress</SelectItem>
                      <SelectItem value="completed" className="font-proxima">Completed</SelectItem>
                      <SelectItem value="withdrawn" className="font-proxima">Withdrawn</SelectItem>
            <SelectItem value="dismissed" className="font-proxima">Dismissed</SelectItem>
                      <SelectItem value="deferred" className="font-proxima">Deferred</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="bulk_is_active"
                  checked={bulkFormData.is_active}
                  onChange={(e) => setBulkFormData({ ...bulkFormData, is_active: e.target.checked })}
                  className="h-4 w-4 text-[#4242EA] rounded"
                />
                <Label htmlFor="bulk_is_active" className="font-proxima cursor-pointer">
                  Active enrollment
                </Label>
              </div>

              <div>
                <Label className="font-proxima">Notes</Label>
                <Textarea
                  value={bulkFormData.notes}
                  onChange={(e) => setBulkFormData({ ...bulkFormData, notes: e.target.value })}
                  placeholder="Additional notes for all enrollments..."
                  rows={2}
                  className="font-proxima"
                />
              </div>

              {destinationCohortId && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="font-proxima text-sm font-medium text-slate-700">
                    Enrolling {selectedUserIds.length} builder{selectedUserIds.length !== 1 ? 's' : ''} into{' '}
                    <span className="font-semibold text-[#4242EA]">
                      {cohorts.find(c => c.cohort_id.toString() === destinationCohortId)?.name}
                    </span>
                  </p>
                  {selectedUserIds.some(id => destEnrolledUserIds.has(id)) && (
                    <p className="font-proxima text-xs text-amber-600 mt-2">
                      Note: {selectedUserIds.filter(id => destEnrolledUserIds.has(id)).length} builder(s) are already enrolled in this cohort and will be skipped by the server.
                    </p>
                  )}
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setBulkStep(1)}
                  className="font-proxima"
                >
                  Back
                </Button>
                <Button
                  type="button"
                  onClick={handleBulkSubmit}
                  disabled={!destinationCohortId || selectedUserIds.length === 0}
                  className="bg-[#4242EA] hover:bg-[#3535BA] text-white font-proxima"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Create {selectedUserIds.length} Enrollment{selectedUserIds.length !== 1 ? 's' : ''}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default EnrollmentsTab;

