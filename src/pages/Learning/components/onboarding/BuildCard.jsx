import { Sparkles, ExternalLink } from 'lucide-react';

// The workshop-build recognition card — rendered above the coach's opener so
// the builder's first impression is "it read my work." `artifactUrl` is only
// ever present when the server VALIDATED reachability at prepare time (a dead
// link on the highest-trust moment of Day 0 is worse than no link).
function BuildCard({ whatYouBuilt, artifactUrl }) {
  if (!whatYouBuilt) return null;
  const excerpt = whatYouBuilt.length > 220 ? `${whatYouBuilt.slice(0, 217)}…` : whatYouBuilt;
  return (
    <div className="mb-6 rounded-xl border border-pursuit-purple/20 bg-pursuit-purple/5 px-4 py-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Sparkles className="w-4 h-4 text-pursuit-purple" />
        <span className="text-xs font-proxima-bold uppercase tracking-wide text-pursuit-purple">
          Your workshop build
        </span>
      </div>
      <p className="text-sm text-carbon-black font-proxima leading-relaxed">{excerpt}</p>
      {artifactUrl && (
        <a
          href={artifactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-sm font-proxima font-semibold text-pursuit-purple hover:underline"
        >
          View your build <ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
    </div>
  );
}

export default BuildCard;
