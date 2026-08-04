import React from 'react';
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

const StoryCard = ({ icon: Icon, title, accent, accentBg, children, empty }) => (
  <article
    className="
      group relative overflow-hidden
      rounded-2xl bg-white
      ring-1 ring-[#E3E3E3]
      shadow-sm hover:shadow-md
      transition-all duration-200
      p-6
      flex flex-col
    "
  >
    {/* Accent rail on the left edge */}
    <div
      aria-hidden="true"
      className="absolute inset-y-0 left-0 w-1"
      style={{ backgroundColor: accent }}
    />
    <header className="flex items-center gap-3">
      <div
        className="
          w-9 h-9 rounded-lg flex items-center justify-center shrink-0
        "
        style={{ backgroundColor: accentBg }}
      >
        <Icon className="w-5 h-5" style={{ color: accent }} />
      </div>
      <h3 className="text-base font-proxima-bold text-[#1E1E1E]">{title}</h3>
    </header>
    <div className="mt-4 flex-1 text-sm leading-relaxed text-[#1E1E1E]/85 font-proxima">
      {children || (
        <p className="italic text-[#999]">{empty || 'Not yet captured.'}</p>
      )}
    </div>
  </article>
);

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
        accent="#4242EA"
        accentBg="rgba(66, 66, 234, 0.08)"
      >
        {background ? <Markdown>{background}</Markdown> : null}
      </StoryCard>

      <StoryCard
        icon={Target}
        title="Goals"
        accent="#FF33FF"
        accentBg="rgba(255, 51, 255, 0.08)"
      >
        {goals ? <Markdown>{goals}</Markdown> : null}
      </StoryCard>

      <StoryCard
        icon={Brain}
        title="Learning Style"
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
