import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen, Target, Brain } from 'lucide-react';

/**
 * BuilderSnapshotStoryGrid
 *
 * A 3-column band of narrative cards: Background / Goals / Learning Style.
 * Each card has its own accent color (drawn from the Pursuit palette) so the
 * trio reads as a visual chapter, not three identical boxes.
 *
 * Props:
 *   - profile: full builder_profiles JSONB shape. Reads:
 *     background.markdown, goals.markdown, learning_profile.markdown,
 *     learning_modality_preferences.preferred
 */

// The teaching-method enum is SIX-wide (server: queries/builderProfiles.js
// VALID_TEACHING_METHODS). This map had only three entries, so the other three
// fell through to the raw slug — Dennys Antunish's card read "Prefers
// experiential" in lowercase. `demonstration` is a retired value merged into
// example_based (2026-06-22) but is still stored on older profiles, so it is
// aliased here the way the server aliases it at read time.
const TEACHING_METHOD_LABEL = {
  socratic: 'Socratic',
  direct: 'Direct',
  example_based: 'Example-Based',
  inquiry_based: 'Inquiry-Based',
  problem_based: 'Problem-Based',
  experiential: 'Experiential',
  demonstration: 'Example-Based', // legacy alias
};

/**
 * StoryCard — a narrow card with a coloured left rail.
 *
 * Prose is COLLAPSED by default (2026-08-07). These three cards carried 600-1300
 * characters of markdown each, side by side, which is unreadable at column width
 * and was the original complaint about this page. The eyebrow says where the
 * content came from, a few lines show, and the rest is one click away — the text
 * is never truncated away, just folded.
 */
const StoryCard = ({ icon: Icon, title, eyebrow, accent, accentBg, children, empty, collapsible = true }) => {
  const [open, setOpen] = useState(false);
  return (
  <article className="group relative overflow-hidden rounded-2xl bg-white ring-1 ring-[#E3E3E3] shadow-[0_2px_4px_rgba(0,0,0,.05)] p-5 md:p-6 flex flex-col">
    {/* Accent rail on the left edge */}
    <div
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-1"
      style={{ backgroundColor: accent }}
    />
    <header className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: accentBg }}>
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div>
        <h3 className="text-[13px] font-proxima-bold text-[#1E1E1E] leading-tight">{title}</h3>
        {eyebrow && (
          <div className="text-[10px] uppercase tracking-wider text-[#AAA] font-proxima-bold mt-[1px]">{eyebrow}</div>
        )}
      </div>
    </header>
    <div
      className={`mt-3 flex-1 text-[13px] leading-relaxed text-[#1E1E1E]/85 font-proxima ${
        collapsible && !open ? 'line-clamp-4' : ''
      }`}
    >
      {children || <p className="italic text-[#999]">{empty || 'Not yet captured.'}</p>}
    </div>
    {collapsible && children && (
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2.5 self-start text-[11.5px] font-proxima-bold hover:underline"
        style={{ color: accent }}
        aria-expanded={open}
      >
        {open ? 'Show less' : 'Read the full profile →'}
      </button>
    )}
  </article>
  );
};

const Markdown = ({ children }) => (
  <ReactMarkdown
    components={{
      p: (p) => <p className="mb-3 last:mb-0" {...p} />,
      ul: (p) => <ul className="list-disc pl-5 my-2 space-y-1" {...p} />,
      ol: (p) => <ol className="list-decimal pl-5 my-2 space-y-1" {...p} />,
      a: (p) => (
        <a
          className="text-[#4242EA] hover:underline break-all"
          target="_blank"
          rel="noopener noreferrer"
          {...p}
        />
      ),
      strong: (p) => <strong className="font-proxima-bold text-[#1E1E1E]" {...p} />,
      em: (p) => <em className="italic" {...p} />,
    }}
  >
    {children}
  </ReactMarkdown>
);

const BuilderSnapshotStoryGrid = ({ profile }) => {
  const background = profile?.background?.markdown;
  const goals = profile?.goals?.markdown;
  const learning = profile?.learning_profile?.markdown;
  const preferred = profile?.learning_modality_preferences?.preferred;
  const preferredLabel = preferred ? TEACHING_METHOD_LABEL[preferred] || preferred : null;

  return (
    <section aria-label="Builder story" className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <StoryCard
        icon={BookOpen}
        title="Background"
        eyebrow="Self-reported at intake"
        accent="#4242EA"
        accentBg="rgba(66, 66, 234, 0.08)"
      >
        {background ? <Markdown>{background}</Markdown> : null}
      </StoryCard>

      <StoryCard
        icon={Target}
        title="Goals"
        eyebrow="Self-reported at intake"
        accent="#FF33FF"
        accentBg="rgba(255, 51, 255, 0.08)"
      >
        {goals ? <Markdown>{goals}</Markdown> : null}
      </StoryCard>

      <StoryCard
        icon={Brain}
        title="How to coach them"
        eyebrow="Derived from graded sessions"
        accent="#FB923C"
        accentBg="rgba(251, 146, 60, 0.10)"
      >
        {learning ? <Markdown>{learning}</Markdown> : null}
        {preferredLabel && (
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#FB923C]/10 ring-1 ring-[#FB923C]/30 px-2.5 py-1 text-[11px] uppercase tracking-wider text-[#9A4F12] font-proxima-bold">
            Prefers {preferredLabel}
          </div>
        )}
      </StoryCard>
    </section>
  );
};

export default BuilderSnapshotStoryGrid;
