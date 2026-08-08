import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * BuilderSnapshotHero
 *
 * Identity band for the Builder Snapshot: headshot, name, cohort chip, summary.
 *
 * Redesigned 2026-08-07 from a full-bleed purple/pink gradient with a 3-KPI strip
 * to a restrained white card. The gradient competed with the readiness signals
 * directly beneath it for the eye, and the KPI strip it carried was deleted
 * outright (see BuilderSnapshotReadiness). On an admin surface the identity is
 * orientation, not the headline — the signals are.
 *
 * Headshot fallback matches the AdminDashboard BuilderDrawer pattern: a
 * neutral SVG silhouette (head + shoulders) on a light background. Same SVG
 * is used when the image URL is missing AND when it fails to load (onError).
 *
 * Color discipline: only Pursuit palette (#4242EA purple, #FF33FF pink,
 * #1E1E1E carbon, #E3E3E3 stardust, white).
 *
 * Props:
 *   - fullName    {string}        Required. Primary title.
 *   - cohortName  {string}        Cohort label rendered as a chip near the name.
 *   - headshotUrl {string|null}   Image URL; falls back to silhouette SVG.
 *   - summary     {string}        Deterministic 1-2 sentence builder summary.
 *   - onBack      {() => void}    Optional. Renders a small "Back to search"
 *                                  link in the hero's top-right corner.
 */

// Inline silhouette — matches the placeholder pattern in
// pages/AdminDashboard/components/BuilderDrawer.jsx. Same fill colors so the
// staff experience is visually consistent across admin surfaces.
const SilhouetteAvatar = ({ className = 'w-full h-full' }) => (
  <svg
    aria-hidden="true"
    className={className}
    viewBox="0 0 100 100"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect width="100" height="100" fill="#EFEFEF" />
    <circle cx="50" cy="38" r="18" fill="#C8C8C8" />
    <path d="M 10 95 Q 12 62 50 62 Q 88 62 90 95 Z" fill="#C8C8C8" />
  </svg>
);

const BuilderSnapshotHero = ({ fullName, cohortName, headshotUrl, summary, onBack }) => {
  const [imageErrored, setImageErrored] = useState(false);

  // Reset the error gate whenever the URL changes (e.g., switching builders).
  useEffect(() => {
    setImageErrored(false);
  }, [headshotUrl]);

  const showImage = !!headshotUrl && !imageErrored;

  return (
    <section className="relative rounded-2xl bg-white ring-1 ring-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,.05)] font-proxima">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="absolute top-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-md border border-[#E3E3E3] px-3 py-1.5 text-xs text-[#666] hover:bg-[#F7F7F9] transition-colors"
          aria-label="Back to search"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to search
        </button>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-5 p-6 md:px-7">
        <div className="shrink-0 w-[74px] h-[74px] rounded-full overflow-hidden bg-[#E3E3E3]">
          {showImage ? (
            <img
              src={headshotUrl}
              alt={fullName || 'Builder headshot'}
              loading="lazy"
              className="w-full h-full object-cover"
              onError={() => setImageErrored(true)}
            />
          ) : (
            <SilhouetteAvatar />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl md:text-[26px] font-proxima-bold tracking-tight leading-tight text-[#1E1E1E]">
              {fullName || 'Unnamed Builder'}
            </h1>
            {cohortName && (
              <span className="inline-flex items-center rounded-full bg-[#4242EA]/[0.08] px-2.5 py-[3px] text-[11px] uppercase tracking-wider font-proxima-bold text-[#4242EA]">
                {cohortName}
              </span>
            )}
          </div>
          {summary && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#1E1E1E]/85 max-w-3xl">{summary}</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default BuilderSnapshotHero;
