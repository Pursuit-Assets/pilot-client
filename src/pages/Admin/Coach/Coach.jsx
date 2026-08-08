import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import useNavStore from '../../../stores/navStore';
import { usePermissions } from '../../../hooks/usePermissions';
import CoachRuns from '../CoachRuns/CoachRuns';
import CoachEvals from '../CoachEvals/CoachEvals';
import CoachProfiles from '../CoachProfiles/CoachProfiles';
import BuilderSnapshot from '../BuilderSnapshot/BuilderSnapshot';
import GoldenDataset from '../GoldenDataset/GoldenDataset';
import TeachingLab from '../TeachingLab/TeachingLab';
import LearnerProfiles from '../LearnerProfiles/LearnerProfiles';
import CohortInsights from '../CohortInsights/CohortInsights';

// Every tab keeps the SAME font-weight (font-medium) in every state — the
// active tab is distinguished by the purple fill, not by going bold. Changing
// weight on activation reflowed the pill widths and shifted the whole bar, so
// weight is held constant to keep the nav rock-steady on click/focus.
const TAB_TRIGGER_CLASS =
  'data-[state=active]:bg-[#4242EA] data-[state=active]:text-white text-slate-500 hover:text-[#1E1E1E] font-medium font-proxima px-4 py-1.5 text-[13px] rounded-md transition-colors focus:outline-none';

/**
 * Coach — combined admin surface for the v2 coach agent, with tabs for
 * observability (Coach Runs) and automated quality evaluation (Coach Evals).
 * Mirrors the Organization Management tabbed layout.
 *
 * Tabs sync to ?tab=runs|evals|insights|profiles. The Evals tab's "View agent
 * timeline" switches to the Runs tab with that run preselected, and the Cohort
 * Insights tab's builder rows switch to the Snapshot tab (no full navigation).
 */
const Coach = () => {
  const isSecondaryNavPage = useNavStore((s) => s.isSecondaryNavPage);
  const [searchParams, setSearchParams] = useSearchParams();
  const { canAccessPage } = usePermissions();

  // The whole /admin/coach page is gated by a single admin-only page:coach
  // permission (staff receive it only via an explicit grant). All tabs share it.
  const canCoach = canAccessPage('coach');
  const canRuns = canCoach;
  const canEvals = canCoach;
  const canInsights = canCoach;
  const canProfiles = canCoach;
  const canSnapshot = canCoach;
  const canGolden = canCoach;
  const canLab = canCoach;
  const canLearners = canCoach;

  const initialTabParam = searchParams.get('tab');
  // Honor ?tab= only if (a) it's a known tab and (b) the user has access to it;
  // otherwise pick the first tab they can access.
  const resolveInitialTab = () => {
    if (initialTabParam === 'evals' && canEvals) return 'evals';
    if (initialTabParam === 'insights' && canInsights) return 'insights';
    if (initialTabParam === 'profiles' && canProfiles) return 'profiles';
    if (initialTabParam === 'snapshot' && canSnapshot) return 'snapshot';
    if (initialTabParam === 'golden' && canGolden) return 'golden';
    if (initialTabParam === 'lab' && canLab) return 'lab';
    if (initialTabParam === 'learners' && canLearners) return 'learners';
    if (initialTabParam === 'runs' && canRuns) return 'runs';
    if (canRuns) return 'runs';
    if (canEvals) return 'evals';
    if (canProfiles) return 'profiles';
    return 'snapshot';
  };
  const [activeTab, setActiveTab] = useState(resolveInitialTab);
  const [runThread, setRunThread] = useState(() => {
    const t = searchParams.get('thread');
    return t ? parseInt(t, 10) : null;
  });

  useEffect(() => {
    const t = searchParams.get('thread');
    setRunThread(t ? parseInt(t, 10) : null);
  }, [searchParams]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set('tab', tab);
    if (tab !== 'runs') next.delete('thread');
    if (tab !== 'snapshot') next.delete('userId');
    setSearchParams(next, { replace: true });
  };

  // From a Coach Evals case → open that run on the Runs tab.
  const openRunTimeline = (threadId) => {
    setRunThread(threadId);
    setActiveTab('runs');
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'runs');
    next.set('thread', String(threadId));
    setSearchParams(next, { replace: true });
  };

  // From a Cohort Insights builder → open their Builder Snapshot tab in place.
  const openBuilderSnapshot = (userId) => {
    setActiveTab('snapshot');
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'snapshot');
    next.set('userId', String(userId));
    next.delete('thread');
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#EFEFEF] font-proxima">
      <Tabs value={activeTab} onValueChange={handleTabChange} className="flex flex-col flex-1 min-h-0">
        <div className="shrink-0 border-b border-[#E3E3E3] px-6 py-2.5 flex items-center gap-4">
          {!isSecondaryNavPage && (
            <h1 className="text-base font-bold text-[#1E1E1E] shrink-0">Coach</h1>
          )}
          <TabsList className="inline-flex gap-1 h-auto bg-transparent p-0">
            {canRuns && <TabsTrigger value="runs" className={TAB_TRIGGER_CLASS}>Coach Runs</TabsTrigger>}
            {canEvals && <TabsTrigger value="evals" className={TAB_TRIGGER_CLASS}>Coach Evals</TabsTrigger>}
            {canInsights && <TabsTrigger value="insights" className={TAB_TRIGGER_CLASS}>Cohort Insights</TabsTrigger>}
            {/* Profiles tab hidden for now (component kept, see TabsContent below) */}
            {canSnapshot && <TabsTrigger value="snapshot" className={TAB_TRIGGER_CLASS}>Builder Snapshot</TabsTrigger>}
            {canGolden && <TabsTrigger value="golden" className={TAB_TRIGGER_CLASS}>Golden Dataset</TabsTrigger>}
            {canLab && <TabsTrigger value="lab" className={TAB_TRIGGER_CLASS}>Personalized Learning</TabsTrigger>}
            {canLearners && <TabsTrigger value="learners" className={TAB_TRIGGER_CLASS}>Learner Profiles</TabsTrigger>}
          </TabsList>
        </div>

        {canRuns && (
          <TabsContent value="runs" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <CoachRuns embedded openThreadId={runThread} />
          </TabsContent>
        )}
        {canEvals && (
          <TabsContent value="evals" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <CoachEvals embedded onViewTimeline={openRunTimeline} />
          </TabsContent>
        )}
        {canInsights && (
          <TabsContent value="insights" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <CohortInsights embedded onViewSnapshot={openBuilderSnapshot} />
          </TabsContent>
        )}
        {canProfiles && (
          <TabsContent value="profiles" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <CoachProfiles embedded />
          </TabsContent>
        )}
        {canSnapshot && (
          <TabsContent value="snapshot" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <BuilderSnapshot embedded />
          </TabsContent>
        )}
        {canGolden && (
          <TabsContent value="golden" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <GoldenDataset embedded onViewTimeline={openRunTimeline} />
          </TabsContent>
        )}
        {canLab && (
          <TabsContent value="lab" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <TeachingLab />
          </TabsContent>
        )}
        {canLearners && (
          <TabsContent value="learners" className="flex-1 min-h-0 mt-0 focus-visible:outline-none">
            <LearnerProfiles />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};

export default Coach;
