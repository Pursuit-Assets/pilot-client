/* eslint-disable react/prop-types */
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import useAuthStore from '../../stores/authStore';

/**
 * Interview-candidate signup — reached ONLY via the invite link we email
 * (`/candidate/signup?token=<token>`). There is deliberately no button, nav item,
 * or link to this page anywhere in the product, and it is not one of the account
 * types on the `/signup` chooser.
 *
 * The invite is bound to the candidate's email address, so the email is shown
 * read-only and comes from the server — a forwarded link cannot be redeemed under
 * a different address. On success the candidate is logged straight in and lands on
 * the Cohort Hub, which is the entire reason the account exists.
 *
 * Server: controllers/candidateAuthController.js
 *   GET  /api/candidate/validate-invite/:token
 *   POST /api/candidate/access
 */

const API_BASE = import.meta.env.VITE_API_URL;

// Mirrors validations/users.js#isValidPassword on the server, so the candidate gets
// the rule up front instead of a round-trip rejection.
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'A number', test: (p) => /\d/.test(p) },
  { label: 'A special character', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

// Why a link is dead, in the candidate's language. Keys match the server's `status`.
const DEAD_LINK_COPY = {
  used: {
    title: 'This link has already been used',
    body: 'An account was already created with this invitation. Try logging in instead.',
    showLogin: true,
  },
  revoked: {
    title: 'This invitation is no longer active',
    body: 'Please reach out to your Pursuit recruiter for a new link.',
    showLogin: false,
  },
  expired: {
    title: 'This invitation has expired',
    body: 'Please reach out to your Pursuit recruiter and they can send you a new link.',
    showLogin: false,
  },
  invalid: {
    title: "We couldn't verify this invitation",
    body: 'Please double-check the link from your email, or reach out to your Pursuit recruiter.',
    showLogin: false,
  },
  error: {
    title: 'Something went wrong',
    body: "We couldn't check your invitation just now. Please refresh the page, or reach out to your Pursuit recruiter.",
    showLogin: false,
  },
};

const Field = ({ label, ...props }) => (
  <label className="block">
    <span className="block text-white/80 text-sm font-proxima mb-1.5">{label}</span>
    <input
      {...props}
      className="w-full px-4 py-3 rounded-xl bg-white text-[#1E1E1E] font-proxima placeholder:text-slate-400 border border-transparent focus:border-white focus:outline-none disabled:bg-white/60 disabled:text-slate-500"
    />
  </label>
);

const CandidateSignup = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAuthState = useAuthStore((s) => s.setAuthState);
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions);

  const token = (searchParams.get('token') || '').trim();

  // 'validating' | 'valid' | 'dead'
  const [inviteState, setInviteState] = useState(token ? 'validating' : 'dead');
  const [deadReason, setDeadReason] = useState('invalid');
  const [email, setEmail] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Someone already signed in has no business on a signup page.
  useEffect(() => {
    if (isAuthenticated) navigate('/admin-dashboard', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (!token) {
      setInviteState('dead');
      setDeadReason('invalid');
      return;
    }

    let cancelled = false;
    setInviteState('validating');

    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/candidate/validate-invite/${encodeURIComponent(token)}`
        );
        const data = await res.json();
        if (cancelled) return;

        if (res.ok && data.valid) {
          setEmail(data.email);
          setInviteState('valid');
        } else {
          setDeadReason(data.status || 'invalid');
          setInviteState('dead');
        }
      } catch (err) {
        console.error('Failed to validate candidate invite:', err);
        if (cancelled) return;
        setDeadReason('error');
        setInviteState('dead');
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  const passwordChecks = PASSWORD_RULES.map((r) => ({ ...r, met: r.test(password) }));
  // Only a match once there's something to match — an empty pair isn't "matching".
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    passwordChecks.every((c) => c.met) &&
    passwordsMatch &&
    !isSubmitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setIsSubmitting(true);

    try {
      const res = await fetch(`${API_BASE}/api/candidate/access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          password,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'We could not create your account. Please try again.');
        // The invite died between page load and submit (used elsewhere, revoked, expired)
        // — swap to the terminal screen rather than leaving a form that can't succeed.
        if (data.status && DEAD_LINK_COPY[data.status]) {
          setDeadReason(data.status);
          setInviteState('dead');
        }
        return;
      }

      // Log straight in — no verification round-trip, the invite link already proved
      // the email. refreshPermissions loads the role's page permissions before we land.
      setAuthState(data.user, data.token);
      await refreshPermissions();
      navigate(data.redirectTo || '/admin-dashboard', { replace: true });
    } catch (err) {
      console.error('Candidate signup failed:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (inviteState === 'validating') {
    return (
      <div className="min-h-screen bg-pursuit-purple flex items-center justify-center px-8">
        <p className="text-white text-lg font-proxima">Verifying your invitation…</p>
      </div>
    );
  }

  if (inviteState === 'dead') {
    const copy = DEAD_LINK_COPY[deadReason] || DEAD_LINK_COPY.invalid;
    return (
      <div className="min-h-screen bg-pursuit-purple flex items-center justify-center px-8">
        <div className="w-full max-w-md bg-white/10 border border-white/30 rounded-2xl p-8 text-center">
          <h1 className="text-white text-2xl font-bold font-proxima leading-tight">{copy.title}</h1>
          <p className="text-white/80 text-sm font-proxima mt-3 leading-relaxed">{copy.body}</p>
          {copy.showLogin && (
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="mt-6 px-6 py-3 rounded-xl bg-white text-[#4242EA] font-proxima font-semibold hover:bg-white/90"
            >
              Go to login
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pursuit-purple flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="bg-white/10 border border-white/30 rounded-2xl p-5 mb-6">
          <p className="text-white/70 text-sm font-proxima mb-1">Pursuit interview exercise</p>
          <h1 className="text-white text-2xl font-bold font-proxima leading-tight">
            Create your account
          </h1>
          <p className="text-white/80 text-sm font-proxima mt-2 leading-relaxed">
            This gives you read-only access to the cohort dashboard you&apos;ll be reviewing
            for your exercise.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email" type="email" value={email} disabled readOnly />
          <p className="text-white/60 text-xs font-proxima -mt-2">
            This invitation is tied to your email address and can&apos;t be changed.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="First name"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              autoComplete="given-name"
              required
            />
            <Field
              label="Last name"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              autoComplete="family-name"
              required
            />
          </div>

          <Field
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          <ul className="space-y-1">
            {passwordChecks.map((c) => (
              <li
                key={c.label}
                className={`text-xs font-proxima flex items-center gap-2 ${c.met ? 'text-white' : 'text-white/50'}`}
              >
                <span aria-hidden="true">{c.met ? '✓' : '○'}</span>
                {c.label}
              </li>
            ))}
          </ul>

          <Field
            label="Confirm password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          {/* Only speak up once they've actually typed something in the second box —
              flagging a mismatch on an empty field reads as an error they caused. */}
          {confirmPassword.length > 0 && (
            <p
              className={`text-xs font-proxima flex items-center gap-2 -mt-2 ${passwordsMatch ? 'text-white' : 'text-amber-200'}`}
              role="status"
            >
              <span aria-hidden="true">{passwordsMatch ? '✓' : '○'}</span>
              {passwordsMatch ? 'Passwords match' : "Passwords don't match yet"}
            </p>
          )}

          {error && (
            <div className="bg-red-500/20 border border-red-300/40 rounded-xl px-4 py-3">
              <p className="text-white text-sm font-proxima whitespace-pre-line">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full px-6 py-3 rounded-xl bg-white text-[#4242EA] font-proxima font-semibold hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Creating your account…' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default CandidateSignup;
