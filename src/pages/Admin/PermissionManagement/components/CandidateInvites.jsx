import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Ban, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '../../../../stores/authStore';
import { Input } from '../../../../components/ui/input';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../../components/ui/table';

/**
 * Candidate Invites — the staff surface for giving an interview candidate read-only
 * access to the Cohort Hub for their practical exercise.
 *
 * Each invite is bound to one email address, single-use, and expires. The link it
 * produces is the ONLY way to create a `candidate` account (the signup page it opens is
 * not linked anywhere in the product), and it bypasses the pursuit.org / approved-partner
 * email restriction — which is the whole point, since candidates are external.
 *
 * Server: controllers/candidateAuthController.js (gated on page:admin_section, the same
 * permission as this page).
 */

const API_BASE = import.meta.env.VITE_API_URL;

const STATUS_STYLES = {
  open: 'bg-green-100 text-green-800',
  used: 'bg-slate-100 text-slate-700',
  expired: 'bg-amber-100 text-amber-800',
  revoked: 'bg-red-100 text-red-800',
};

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const CandidateInvites = () => {
  const token = useAuthStore((s) => s.token);

  const [expanded, setExpanded] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('14');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidate/invites`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load invites');
      setInvites(data.invites || []);
    } catch (err) {
      console.error('Failed to load candidate invites:', err);
      toast.error(err.message || 'Failed to load candidate invites');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Only fetch once the panel is actually opened — this is a rarely-used tool on a page
  // whose main job is the user table.
  useEffect(() => {
    if (expanded) load();
  }, [expanded, load]);

  const copyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Invite link copied');
    } catch {
      toast.error('Could not copy — select the link and copy manually');
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/candidate/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: email.trim(),
          notes: notes.trim() || undefined,
          expiresInDays: parseInt(expiresInDays, 10) || 14,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invite');

      setEmail('');
      setNotes('');
      await copyLink(data.invite.invite_url);
      toast.success(`Invite created for ${data.invite.email} — link copied`);
      load();
    } catch (err) {
      console.error('Failed to create candidate invite:', err);
      toast.error(err.message || 'Failed to create invite');
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (invite) => {
    try {
      const res = await fetch(`${API_BASE}/api/candidate/invites/${invite.invite_id}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to revoke invite');
      toast.success(`Invite for ${invite.email} revoked`);
      load();
    } catch (err) {
      console.error('Failed to revoke candidate invite:', err);
      toast.error(err.message || 'Failed to revoke invite');
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 mb-4">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400" />
        )}
        <UserPlus className="h-5 w-5 text-[#4242EA]" />
        <span className="flex-1">
          <span className="block font-semibold text-slate-900 font-proxima">Candidate Invites</span>
          <span className="block text-sm text-slate-500 font-proxima">
            Give an interview candidate read-only access to the Cohort Hub
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 p-4 space-y-5">
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
            <label className="flex-1 min-w-[240px]">
              <span className="block text-xs font-medium text-slate-500 mb-1 font-proxima">
                Candidate email
              </span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="candidate@example.com"
                className="font-proxima"
                required
              />
            </label>
            <label className="flex-1 min-w-[240px]">
              <span className="block text-xs font-medium text-slate-500 mb-1 font-proxima">
                Note (optional)
              </span>
              <Input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="AI-Native Instructor, Aug panel"
                className="font-proxima"
              />
            </label>
            <label className="w-28">
              <span className="block text-xs font-medium text-slate-500 mb-1 font-proxima">
                Expires (days)
              </span>
              <Input
                type="number"
                min="1"
                max="90"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="font-proxima"
              />
            </label>
            <Button type="submit" disabled={creating || !email.trim()} className="font-proxima">
              {creating ? 'Creating…' : 'Create invite'}
            </Button>
          </form>

          <p className="text-xs text-slate-500 font-proxima">
            The link is copied to your clipboard when you create it — paste it into the interview
            email. It only works for the address above, only once, and gives read-only access to
            the Cohort Hub.
          </p>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-proxima-bold">Email</TableHead>
                  <TableHead className="font-proxima-bold">Status</TableHead>
                  <TableHead className="font-proxima-bold">Note</TableHead>
                  <TableHead className="font-proxima-bold">Created</TableHead>
                  <TableHead className="font-proxima-bold">Expires</TableHead>
                  <TableHead className="font-proxima-bold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500 font-proxima">
                      Loading invites…
                    </TableCell>
                  </TableRow>
                ) : invites.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500 font-proxima">
                      No candidate invites yet
                    </TableCell>
                  </TableRow>
                ) : (
                  invites.map((invite) => (
                    <TableRow key={invite.invite_id}>
                      <TableCell className="font-medium text-slate-900 font-proxima">
                        {invite.email}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${STATUS_STYLES[invite.status] || STATUS_STYLES.used} font-proxima`}>
                          {invite.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600 font-proxima text-sm">
                        {invite.notes || '—'}
                      </TableCell>
                      <TableCell className="text-slate-600 font-proxima text-sm">
                        {formatDate(invite.created_at)}
                      </TableCell>
                      <TableCell className="text-slate-600 font-proxima text-sm">
                        {invite.used_at ? `used ${formatDate(invite.used_at)}` : formatDate(invite.expires_at)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {invite.status === 'open' && (
                          <>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => copyLink(invite.invite_url)}
                              className="font-proxima"
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" />
                              Copy link
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRevoke(invite)}
                              className="font-proxima text-red-600 hover:text-red-700"
                            >
                              <Ban className="h-3.5 w-3.5 mr-1" />
                              Revoke
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateInvites;
