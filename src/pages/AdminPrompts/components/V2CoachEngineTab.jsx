import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { ScrollArea } from '../../../components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../components/ui/tabs';
import { Brain, BookOpen, Target, ClipboardCheck, MessageSquare, ScrollText, Trophy, Save, GitBranch, Users, Layers, HelpCircle, Gauge, Pencil, Clock } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import LoadingState from './shared/LoadingState';
import PromptFormDialog from './shared/PromptFormDialog';
import CoachV2FlowDiagram from './CoachV2FlowDiagram';
import { NODES as COACH_NODE_META } from './CoachV2NodeTooltip';
import PromptChangeHistoryDialog from './PromptChangeHistoryDialog';
import useAuthStore from '../../../stores/authStore';

const PHASE_ICONS = {
  learn: BookOpen,
  generateApply: ScrollText,
  apply: Target,
  grade: ClipboardCheck,
  remediate: MessageSquare,
  complete: Trophy,
  reflect: Save,
};

// The order the coach runs its prompts during one task, so the Coaching Loop
// sub-tabs read in the sequence a builder actually experiences them.
const LOOP_PROMPT_ORDER = ['learn', 'generateApply', 'apply', 'grade', 'remediate', 'complete', 'reflect'];

/**
 * Inline tooltip: HelpCircle icon that shows a tooltip on hover.
 */
const InfoTip = ({ text }) => (
  <span className="relative group inline-flex items-center">
    <HelpCircle className="h-4 w-4 text-[#999] cursor-help" />
    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 rounded-lg bg-[#1E1E1E] text-white text-xs font-proxima leading-relaxed px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50 shadow-lg">
      {text}
      <span className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#1E1E1E]" />
    </span>
  </span>
);

const SubTabCaption = ({ children }) => (
  <p className="font-proxima text-sm text-[#666] -mt-2">{children}</p>
);

const TemplateCard = ({ phase, template, canEdit, onEdit, onHistory, icon }) => {
  const Icon = icon || PHASE_ICONS[phase] || BookOpen;

  return (
    <Card className="bg-white border-[#C8C8C8]">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-[#4242EA]" />
          <CardTitle className="font-proxima-bold text-[#1E1E1E]">
            {template.name}
          </CardTitle>
          {phase === 'grade' && (
            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">
              Internal Only
            </Badge>
          )}
          {template.id && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="border-[#C8C8C8] text-[#666] hover:bg-[#E3E3E3]"
                onClick={onHistory}
                title="View change history"
              >
                <Clock className="h-4 w-4" />
              </Button>
              {canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#C8C8C8] text-[#1E1E1E] hover:bg-[#E3E3E3]"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          )}
        </div>
        <CardDescription className="font-proxima text-[#666]">
          {template.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-lg">
          <div className="bg-[#F5F5F5] border border-[#E3E3E3] rounded-lg p-4">
            <pre className="font-mono text-sm text-[#1E1E1E] whitespace-pre-wrap leading-relaxed">
              {template.content || '(not yet seeded — run migration)'}
            </pre>
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

const V2CoachEngineTab = ({ showNotification, reloadPrompts, canEdit }) => {
  // Read the token via the auth store selector instead of localStorage so
  // (a) any future token-refresh logic in the store applies here, and (b)
  // a renamed localStorage key never silently sends `Bearer null`.
  const token = useAuthStore((s) => s.token);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // Disable Save buttons while a write is in flight. Prevents double-submit
  // races where a second save fires before the first reloadPrompts/fetchData
  // settle, interleaving state updates.
  const [isSaving, setIsSaving] = useState(false);
  // editTarget shape: { id, content, endpoint, title }
  //   endpoint: 'content-generation' (for v2_coach_* + onboarding_coach_* rows)
  //          | 'contexts'           (for program_contexts row)
  const [editTarget, setEditTarget] = useState(null);
  // configEditTarget shape: { key, value, displayName, description, valueType, min, max }
  // Drives the editable graph-config scalars (max_learn_turns, ema_*,
  // difficulty_thresholds, etc.) under the Config & Reference tab.
  const [configEditTarget, setConfigEditTarget] = useState(null);
  // historyTarget: { entityType, entityId, entityName } — drives the
  // shared PromptChangeHistoryDialog (null = closed). Set by every "History"
  // button across the page; revert refreshes data via fetchData().
  const [historyTarget, setHistoryTarget] = useState(null);

  const openHistory = (entityType, entityId, entityName) =>
    setHistoryTarget({ entityType, entityId, entityName });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/admin/prompts/v2-coach-engine`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (response.ok) {
        setData(await response.json());
      } else {
        throw new Error('Failed to fetch v2 coach engine data');
      }
    } catch (error) {
      console.error('Error fetching v2 coach engine:', error);
      showNotification('Failed to load V2 Coach Engine data', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Save handler shared across every editable section.
  //
  // Both backing tables (content_generation_prompts, program_contexts) need
  // their full row sent on PUT — partial updates aren't supported by the
  // existing controller. So we GET the full row first, swap `content`, and
  // PUT back. After a successful write, reloadPrompts() invalidates the
  // server-side promptManager cache and fetchData() refreshes our view.
  //
  // KNOWN LIMITATION: this GET-then-PUT is not optimistically locked, so two
  // admins editing the same row concurrently will silently last-write-wins.
  // Acceptable today because this surface is admin-only with effectively
  // zero concurrent edit traffic and every save lands in prompt_change_history
  // (audit + revert), so a stomp is recoverable. Promote to a PATCH endpoint
  // with an If-Match/updated_at guard if concurrent editing becomes real.
  const handleSaveContent = async ({ content }) => {
    if (!editTarget || isSaving) return;
    setIsSaving(true);
    const { id, endpoint, title } = editTarget;
    const base = `${import.meta.env.VITE_API_URL}/api/admin/prompts/${endpoint}/${id}`;
    try {
      const getRes = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
      if (!getRes.ok) throw new Error(`GET failed: ${getRes.status}`);
      const getBody = await getRes.json();
      // GET responses wrap the row in `{program_context: {...}}` for contexts
      // and `{prompt: {...}}` for content-generation. Normalize.
      const row = getBody.program_context || getBody.prompt || getBody;
      const putBody = { ...row, content };
      delete putBody.id;
      delete putBody.created_at;
      delete putBody.updated_at;
      const putRes = await fetch(base, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(putBody),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(err.error || `PUT failed: ${putRes.status}`);
      }
      setEditTarget(null);
      showNotification(`${title} saved`);
      // Await both refreshes so isSaving stays true until the new state is
      // mounted — otherwise a second save could race against the in-flight
      // reload and interleave updates.
      await Promise.all([
        reloadPrompts ? reloadPrompts() : Promise.resolve(),
        fetchData(),
      ]);
    } catch (error) {
      console.error(`Error saving ${title}:`, error);
      showNotification(`Failed to save ${title}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Convenience: open the dialog with the right endpoint + title.
  const openEditor = (id, content, endpoint, title) => {
    if (!id) {
      showNotification(`${title} is not yet seeded — run the seed migration first`, 'error');
      return;
    }
    setEditTarget({ id, content: content || '', endpoint, title });
  };

  // Save handler for graph-config scalars. PUT /coach-v2-config/:key with
  // either a number (integer / number value_types) or an object (e.g.,
  // difficulty_thresholds = {advanced, intermediate}). Form fields are
  // generated dynamically based on valueType.
  const handleSaveConfig = async (formData) => {
    if (!configEditTarget || isSaving) return;
    setIsSaving(true);
    const { key, valueType, displayName } = configEditTarget;

    // Build the value payload from form data based on type.
    let value;
    if (valueType === 'object' && key === 'dreyfus_legacy_thresholds') {
      // One cutoff per Dreyfus level 2-5; below the level-2 cutoff is level 1.
      value = {
        2: Number(formData.level2),
        3: Number(formData.level3),
        4: Number(formData.level4),
        5: Number(formData.level5),
      };
    } else if (valueType === 'object' && key === 'difficulty_thresholds') {
      value = {
        advanced: Number(formData.advanced),
        intermediate: Number(formData.intermediate),
      };
    } else {
      // integer / number: form has a single "value" field
      value = valueType === 'integer'
        ? Number.parseInt(formData.value, 10)
        : Number.parseFloat(formData.value);
    }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/prompts/coach-v2-config/${encodeURIComponent(key)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ value }),
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `PUT failed: ${res.status}`);
      }
      setConfigEditTarget(null);
      showNotification(`${displayName} saved`);
      await Promise.all([
        reloadPrompts ? reloadPrompts() : Promise.resolve(),
        fetchData(),
      ]);
    } catch (error) {
      console.error(`Error saving ${displayName}:`, error);
      showNotification(`Failed to save ${displayName}: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Save handler for individual skill edits. Builds an updated taxonomy
  // (merging the edited skill into skills[slug]) and PUTs the whole thing.
  // Compute the field list for the config-edit dialog from the target's shape.
  const configFields = (() => {
    if (!configEditTarget) return [];
    const { key, valueType, value, min, max, description } = configEditTarget;
    if (valueType === 'object' && key === 'dreyfus_legacy_thresholds') {
      const LEVEL_NAMES = { 2: 'Advanced Beginner', 3: 'Competent', 4: 'Proficient', 5: 'Expert' };
      return [2, 3, 4, 5].map((lvl) => ({
        name: `level${lvl}`,
        label: `Level ${lvl} — ${LEVEL_NAMES[lvl]} (legacy score ≥)`,
        type: 'number',
        required: true,
        defaultValue: value?.[lvl] ?? '',
        helpText:
          lvl === 2
            ? 'A positive legacy score below this maps to level 1 (Novice). Cutoffs must increase from level 2 to 5.'
            : `Legacy scores at or above this map to level ${lvl}.`,
      }));
    }
    if (valueType === 'object' && key === 'difficulty_thresholds') {
      return [
        {
          name: 'advanced',
          label: 'Advanced threshold (avg skill_level ≥)',
          type: 'number',
          required: true,
          defaultValue: value?.advanced ?? '',
          helpText: 'Builders averaging at or above this level get the advanced teaching mode.',
        },
        {
          name: 'intermediate',
          label: 'Intermediate threshold (avg skill_level ≥)',
          type: 'number',
          required: true,
          defaultValue: value?.intermediate ?? '',
          helpText: 'Below this, the coach defaults to beginner mode. Must be less than the advanced threshold.',
        },
      ];
    }
    return [
      {
        name: 'value',
        label: configEditTarget.displayName,
        type: 'number',
        required: true,
        defaultValue: value ?? '',
        helpText: `${description}${min != null || max != null ? ` Range: ${min ?? '−∞'}–${max ?? '∞'}.` : ''}`,
      },
    ];
  })();

  if (loading) return <LoadingState count={3} />;
  if (!data) return null;

  const {
    templates,
    programContext,
    graphConfig,
    profileFields,
    onboardingAgent,
    coachv2InlineNodes,
    evalRubric,
  } = data;

  // The Coaching Loop sub-tab shows the 4 phase templates plus the 3 editable
  // node prompts (Generate Challenge / Complete / Reflect) that used to live on
  // their own tab — merged here in the order the coach runs them so every
  // editable coaching prompt is viewable and editable in one place.
  const loopPrompts = LOOP_PROMPT_ORDER
    .map((key) => {
      if (templates?.[key]) return { key, template: templates[key] };
      const node = (coachv2InlineNodes || []).find((n) => n.node === key && n.editableNode && n.id);
      if (node) {
        return {
          key,
          template: {
            name: COACH_NODE_META[key]?.name || node.label,
            description: node.description,
            content: node.content,
            id: node.id,
          },
        };
      }
      return null;
    })
    .filter(Boolean);

  // The Onboarding tab is an edit surface, so only show the editable prompt
  // sections — never the read-only "computed at runtime" debug sections, even
  // if an older backend still includes them in the payload.
  const onboardingSections = (onboardingAgent?.sections || []).filter((s) => s.editable !== false);

  return (
    <div className="space-y-6">
      {/* Sub-tabs — Config & Reference leads as the orientation surface
          (graph flow diagram, program context, profile fields, skill
          taxonomy); then the editable surfaces in execution order:
          coaching loop → onboarding → eval harness. */}
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="bg-white border border-[#C8C8C8] p-1 h-auto flex-wrap justify-start">
          <TabsTrigger
            value="config"
            className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
          >
            <GitBranch className="h-4 w-4 mr-2" />
            Config &amp; Reference
          </TabsTrigger>
          <TabsTrigger
            value="loop"
            className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
          >
            <Brain className="h-4 w-4 mr-2" />
            Coaching Loop
          </TabsTrigger>
          <TabsTrigger
            value="onboarding"
            className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Onboarding
          </TabsTrigger>
          <TabsTrigger
            value="eval"
            className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
          >
            <Gauge className="h-4 w-4 mr-2" />
            Eval Harness
          </TabsTrigger>
        </TabsList>

        {/* ========== Sub-tab 1: Coaching Loop ========== */}
        <TabsContent value="loop" className="space-y-6 mt-6">
          <SubTabCaption>
            Every prompt the coach uses while running a builder through a task, in the order they happen. All editable — saves take effect on the next coach turn.
          </SubTabCaption>

          {/* Coaching prompts */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-5 w-5 text-[#4242EA]" />
              <h3 className="font-proxima-bold text-xl text-[#1E1E1E]">Coaching Prompts</h3>
              <InfoTip text="These are the system prompts sent to the AI at each step of the conversation. They define how the coach behaves — what it says, what it hides, when it transitions. Variables in {curly_braces} are filled in at runtime with the builder's profile, task content, etc." />
            </div>

            <Tabs defaultValue={loopPrompts[0]?.key} className="w-full">
              <TabsList className="bg-white border border-[#C8C8C8] p-1 h-auto flex-wrap justify-start">
                {loopPrompts.map(({ key, template }) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
                  >
                    {template.name}
                  </TabsTrigger>
                ))}
              </TabsList>
              <div className="mt-4">
                {loopPrompts.map(({ key, template }) => (
                  <TabsContent key={key} value={key} className="m-0">
                    <TemplateCard
                      phase={key}
                      template={template}
                      canEdit={canEdit}
                      onEdit={() => openEditor(template.id, template.content, 'content-generation', `${template.name} template`)}
                      onHistory={() => openHistory('content_generation_prompt', String(template.id), template.name)}
                    />
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>
        </TabsContent>

        {/* ========== Sub-tab 2: Onboarding ========== */}
        <TabsContent value="onboarding" className="space-y-6 mt-6">
          <SubTabCaption>
            The Day-0 "meet-and-greet" chat that runs once before the coaching loop and seeds the builder's profile. The 5 sections below are the pieces of its system prompt — all editable; saves take effect on the next onboarding chat.
          </SubTabCaption>

          {onboardingAgent && onboardingSections.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare className="h-5 w-5 text-[#4242EA]" />
                <h3 className="font-proxima-bold text-xl text-[#1E1E1E]">{onboardingAgent.name}</h3>
                <InfoTip text="The Day-0 onboarding chat that runs before the v2 coach takes over. SSE-streamed text with optional browser dictation. It seeds the builder's profile (background, goals, learning style) and is the same coach persona that will accompany them through the program. Each section below is one part of its system prompt." />
              </div>

              <Tabs defaultValue={onboardingSections[0]?.key} className="w-full">
                <TabsList className="bg-white border border-[#C8C8C8] p-1 h-auto flex-wrap justify-start">
                  {onboardingSections.map((section) => (
                    <TabsTrigger
                      key={section.key}
                      value={section.key}
                      className="font-proxima data-[state=active]:bg-[#4242EA] data-[state=active]:text-white"
                    >
                      {section.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                <div className="mt-4">
                  {onboardingSections.map((section) => (
                    <TabsContent key={section.key} value={section.key} className="m-0">
                      <TemplateCard
                        phase={section.key}
                        icon={MessageSquare}
                        template={{
                          name: section.label,
                          description: section.description,
                          content: section.content,
                          id: section.id,
                        }}
                        canEdit={canEdit}
                        onEdit={() => openEditor(section.id, section.content, 'content-generation', section.label)}
                        onHistory={() => openHistory('content_generation_prompt', String(section.id), section.label)}
                      />
                    </TabsContent>
                  ))}
                </div>
              </Tabs>
            </div>
          )}
        </TabsContent>

        {/* ========== Sub-tab 3: Eval Harness ========== */}
        <TabsContent value="eval" className="space-y-6 mt-6">
          <SubTabCaption>
            Headless quality-evaluation rubric and templates. The 6 judge dimensions are read-only code constants; the Judge and Simulated Builder templates are editable.
          </SubTabCaption>

          {evalRubric && (
            <Card className="bg-white border-[#C8C8C8]">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Gauge className="h-5 w-5 text-[#4242EA]" />
                  <CardTitle className="font-proxima-bold text-[#1E1E1E]">
                    {evalRubric.name}
                  </CardTitle>
                  <InfoTip text="The rubric the v2 coach eval harness uses to judge runs. Each dimension's criterion below is the rubric text fed to the LLM judge. The judge template and simulated-builder template are the full prompts used in services/coachEvalJudges.js + the simulated-builder driver." />
                </div>
                <CardDescription className="font-proxima text-[#666]">
                  {evalRubric.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="font-proxima-bold text-sm text-[#1E1E1E] mb-2">Judge Dimensions</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(evalRubric.dimensions || []).map((d) => (
                      <div key={d.key} className="bg-[#F5F5F5] rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="font-mono text-xs bg-white">
                            {d.key}
                          </Badge>
                          <p className="font-proxima-bold text-sm text-[#1E1E1E]">{d.label}</p>
                        </div>
                        {d.description && (
                          <p className="font-proxima text-xs text-[#666] mb-2">{d.description}</p>
                        )}
                        <p className="font-proxima text-sm text-[#1E1E1E] leading-relaxed">
                          {d.criterion}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-proxima-bold text-sm text-[#1E1E1E]">Judge Template</p>
                    {evalRubric.judgeTemplate?.id && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#C8C8C8] text-[#666] hover:bg-[#E3E3E3]"
                          onClick={() => openHistory('content_generation_prompt', String(evalRubric.judgeTemplate.id), 'Judge Template')}
                          title="View change history"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#C8C8C8] text-[#1E1E1E] hover:bg-[#E3E3E3]"
                            onClick={() => openEditor(evalRubric.judgeTemplate.id, evalRubric.judgeTemplate.content, 'content-generation', 'Judge Template')}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="font-proxima text-xs text-[#666] mb-2">content_generation_prompts: v2_coach_eval_judge — the system prompt every dimension's LLM judge receives, with the per-dimension rubric substituted in.</p>
                  <div className="bg-[#F5F5F5] border border-[#E3E3E3] rounded-lg">
                    <ScrollArea className="max-h-[360px] w-full p-3">
                      <pre className="font-mono text-xs text-[#1E1E1E] whitespace-pre-wrap leading-relaxed">
                        {evalRubric.judgeTemplate?.content || '(not yet seeded — run migration)'}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="font-proxima-bold text-sm text-[#1E1E1E]">Simulated Builder Template</p>
                    {evalRubric.simulatedBuilderTemplate?.id && (
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-[#C8C8C8] text-[#666] hover:bg-[#E3E3E3]"
                          onClick={() => openHistory('content_generation_prompt', String(evalRubric.simulatedBuilderTemplate.id), 'Simulated Builder Template')}
                          title="View change history"
                        >
                          <Clock className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[#C8C8C8] text-[#1E1E1E] hover:bg-[#E3E3E3]"
                            onClick={() => openEditor(evalRubric.simulatedBuilderTemplate.id, evalRubric.simulatedBuilderTemplate.content, 'content-generation', 'Simulated Builder Template')}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="font-proxima text-xs text-[#666] mb-2">content_generation_prompts: v2_coach_eval_simulated_builder — the persona-driven prompt the harness uses to drive each coach run headlessly.</p>
                  <div className="bg-[#F5F5F5] border border-[#E3E3E3] rounded-lg">
                    <ScrollArea className="max-h-[360px] w-full p-3">
                      <pre className="font-mono text-xs text-[#1E1E1E] whitespace-pre-wrap leading-relaxed">
                        {evalRubric.simulatedBuilderTemplate?.content || '(not yet seeded — run migration)'}
                      </pre>
                    </ScrollArea>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ========== Sub-tab 5: Config & Reference ========== */}
        <TabsContent value="config" className="space-y-6 mt-6">
          <SubTabCaption>
            Read-only structural data (graph flow, builder profile fields, skill taxonomy) plus the editable Program Context — shared with V1 chat, so edits affect both engines.
          </SubTabCaption>

          {/* Graph Flow Overview */}
          <Card className="bg-white border-[#C8C8C8]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <GitBranch className="h-5 w-5 text-[#4242EA]" />
                <CardTitle className="font-proxima-bold text-[#1E1E1E]">
                  {graphConfig.name}
                </CardTitle>
                <InfoTip text="This is the orchestrator that controls how the AI coach interacts with each builder. Each conversation follows this flow: the coach teaches, then gives a challenge, grades the response, and either completes the task or gives targeted feedback for a retry." />
              </div>
              <CardDescription className="font-proxima text-[#666]">
                {graphConfig.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Flow diagram — rendered from a Mermaid spec in
                  components/CoachV2FlowDiagram.jsx. Mirrors graphs/coachV2/
                  controller.js + edges.js on the server. */}
              <div className="bg-white border border-[#E3E3E3] rounded-lg p-4">
                <CoachV2FlowDiagram />
                <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-proxima text-[#666]">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm bg-[#4242EA]" />
                    Happy path
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded-sm bg-orange-400" />
                    Remediation loop (max 2 retries)
                  </span>
                </div>
              </div>

              {/* Editable scalar config — backed by coach_v2_config */}
              {graphConfig.editable && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const editable = graphConfig.editable;
                    const cards = [
                      { row: editable.maxLearnTurns, suffix: 'turns' },
                      { row: editable.maxApplyAttempts, suffix: 'attempts' },
                      { row: editable.dreyfusTargetOffset, suffix: 'stage(s) above current' },
                      { row: editable.evalPassThreshold, suffix: '/100' },
                      { row: editable.emaExistingWeight, suffix: '' },
                      { row: editable.emaNewWeight, suffix: '' },
                    ];
                    return cards.map(({ row, suffix }) => row && (
                      <div key={row.key} className="bg-[#F5F5F5] rounded-lg p-3 group">
                        <div className="flex items-start gap-1 mb-1">
                          <p className="font-proxima text-xs text-[#666] flex-1">{row.displayName}</p>
                          <InfoTip text={row.description} />
                          <button
                            onClick={() => openHistory('coach_v2_config', row.key, row.displayName)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-[#666] hover:text-[#1E1E1E]"
                            title={`History for ${row.displayName}`}
                          >
                            <Clock className="h-3.5 w-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => setConfigEditTarget(row)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[#4242EA] hover:text-[#3232BA]"
                              title={`Edit ${row.displayName}`}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="font-proxima-bold text-lg text-[#1E1E1E]">
                          {row.value}{suffix && <span className="font-proxima text-sm text-[#999] ml-1">{suffix}</span>}
                        </p>
                      </div>
                    ));
                  })()}
                </div>
              )}

              {/* How difficulty is chosen (Dreyfus-native as of 2026-07-28) */}
              {graphConfig.difficultyNote && (
                <div className="bg-[#F5F5F5] rounded-lg p-3">
                  <p className="font-proxima text-sm text-[#666]">
                    <span className="font-proxima-bold text-[#1E1E1E]">Challenge difficulty:</span>{' '}
                    {graphConfig.difficultyNote}
                  </p>
                </div>
              )}

              {/* Legacy score → Dreyfus level cutoffs — editable object */}
              {graphConfig.editable?.dreyfusLegacyThresholds && (
                <div>
                  <div className="flex items-center gap-1 mb-2">
                    <p className="font-proxima text-sm text-[#666]">{graphConfig.editable.dreyfusLegacyThresholds.displayName}</p>
                    <InfoTip text={graphConfig.editable.dreyfusLegacyThresholds.description} />
                    <div className="ml-auto flex items-center gap-3">
                      <button
                        onClick={() => openHistory('coach_v2_config', graphConfig.editable.dreyfusLegacyThresholds.key, graphConfig.editable.dreyfusLegacyThresholds.displayName)}
                        className="text-[#666] hover:text-[#1E1E1E] inline-flex items-center gap-1 text-xs font-proxima"
                        title="History"
                      >
                        <Clock className="h-3.5 w-3.5" />
                      </button>
                      {canEdit && (
                        <button
                          onClick={() => setConfigEditTarget(graphConfig.editable.dreyfusLegacyThresholds)}
                          className="text-[#4242EA] hover:text-[#3232BA] inline-flex items-center gap-1 text-xs font-proxima"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    {(() => {
                      const v = graphConfig.editable.dreyfusLegacyThresholds.value || {};
                      const LEVELS = [
                        [1, 'Novice', `> 0 and < ${v[2]}`],
                        [2, 'Advanced Beginner', `≥ ${v[2]} and < ${v[3]}`],
                        [3, 'Competent', `≥ ${v[3]} and < ${v[4]}`],
                        [4, 'Proficient', `≥ ${v[4]} and < ${v[5]}`],
                        [5, 'Expert', `≥ ${v[5]}`],
                      ];
                      return LEVELS.map(([lvl, name, range]) => (
                        <div key={lvl} className="bg-[#F5F5F5] rounded-lg p-2 flex items-center gap-2">
                          <Badge variant="outline" className="font-proxima text-xs">L{lvl} {name}</Badge>
                          <span className="font-mono text-xs text-[#666]">{range}</span>
                        </div>
                      ));
                    })()}
                  </div>
                  <p className="font-proxima text-xs text-[#999] mt-2">
                    Only used for skills where the builder has no Dreyfus proficiency entry yet — the
                    operative <code className="font-mono">skill_proficiency</code> level always wins.
                  </p>
                </div>
              )}

              {/* Live-coach pass-threshold note (enforced inside the v2_coach_grade prompt) */}
              {graphConfig.passThresholdLiveNote && (
                <p className="font-proxima text-xs text-[#666] italic">
                  {graphConfig.passThresholdLiveNote}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Program Context */}
          <Card className="bg-white border-[#C8C8C8]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-[#4242EA]" />
                <CardTitle className="font-proxima-bold text-[#1E1E1E]">
                  {programContext.name}
                </CardTitle>
                <InfoTip text="This is injected into the coach's system prompt during the Learn and Remediate phases so it understands what program the builder is in, the philosophy (AI-first), and the trajectory. Without this, the coach would give generic tutoring instead of program-relevant guidance. SHARED with V1 chat — edits affect both engines." />
                {programContext.id && (
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-[#C8C8C8] text-[#666] hover:bg-[#E3E3E3]"
                      onClick={() => openHistory('program_context', String(programContext.id), 'Program Context')}
                      title="View change history"
                    >
                      <Clock className="h-4 w-4" />
                    </Button>
                    {canEdit && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-[#C8C8C8] text-[#1E1E1E] hover:bg-[#E3E3E3]"
                        onClick={() => openEditor(programContext.id, programContext.content, 'contexts', 'Program Context')}
                      >
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <CardDescription className="font-proxima text-[#666]">
                {programContext.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="bg-[#F5F5F5] border border-[#E3E3E3] rounded-lg p-4">
                <pre className="font-mono text-sm text-[#1E1E1E] whitespace-pre-wrap leading-relaxed">
                  {programContext.content || '(not yet seeded — run migration)'}
                </pre>
              </div>
            </CardContent>
          </Card>

          {/* Builder Profile Fields */}
          <Card className="bg-white border-[#C8C8C8]">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#4242EA]" />
                <CardTitle className="font-proxima-bold text-[#1E1E1E]">
                  {profileFields.name}
                </CardTitle>
                <InfoTip text="Each builder has a profile that the engine reads at the start of every task and writes to after completion. This is how the coach 'remembers' the builder across sessions — their skill levels, how they learn best, and where they've struggled." />
              </div>
              <CardDescription className="font-proxima text-[#666]">
                {profileFields.description}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(profileFields.fields).map(([field, description]) => (
                  <div key={field} className="flex items-start gap-3 bg-[#F5F5F5] rounded-lg p-3">
                    <code className="font-mono text-sm text-[#4242EA] bg-white px-2 py-0.5 rounded border border-[#E3E3E3] shrink-0">
                      {field}
                    </code>
                    <span className="font-proxima text-sm text-[#666]">{description}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Skill Taxonomy moved to its own top-level "Skill Taxonomy" tab
              (2026-06-28) — flat 45-skill model + per-skill Dreyfus level
              definitions are managed there. */}
          <Card className="bg-white border-[#C8C8C8]">
            <CardHeader>
              <CardTitle className="font-proxima-bold text-[#1E1E1E]">Skill Taxonomy</CardTitle>
              <CardDescription className="font-proxima text-[#666]">
                Skill management moved to its own top-level <span className="font-proxima-bold">Skill Taxonomy</span> tab,
                where you can edit each skill and its Dreyfus level definitions (0–5).
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit dialog — shared across every editable section. Renders via
          portal so its DOM position doesn't matter; placed at the V2 page
          level so it sits above the sub-tabs and persists across tab switches. */}
      {editTarget && (
        <PromptFormDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          onSubmit={handleSaveContent}
          isSubmitting={isSaving}
          title={`Edit: ${editTarget.title}`}
          confirmText="Save"
          initialData={{ content: editTarget.content }}
          fields={[
            {
              name: 'content',
              label: 'Content',
              type: 'textarea',
              required: true,
              rows: 22,
              helpText: 'Saved on the next coach turn. {placeholders} in curly braces are runtime substitutions — don\'t change their names.',
            },
          ]}
        />
      )}

      {/* Graph-config scalar edit dialog (max_learn_turns, EMA weights, etc.) */}
      {configEditTarget && (
        <PromptFormDialog
          open={!!configEditTarget}
          onClose={() => setConfigEditTarget(null)}
          onSubmit={handleSaveConfig}
          isSubmitting={isSaving}
          title={`Edit: ${configEditTarget.displayName}`}
          confirmText="Save"
          initialData={configFields.reduce((acc, f) => ({ ...acc, [f.name]: f.defaultValue }), {})}
          fields={configFields}
        />
      )}

      {/* Change history dialog — shared, opened from any History button. */}
      {historyTarget && (
        <PromptChangeHistoryDialog
          open={!!historyTarget}
          onClose={() => setHistoryTarget(null)}
          target={historyTarget}
          onReverted={() => {
            if (reloadPrompts) reloadPrompts();
            fetchData();
          }}
          showNotification={showNotification}
        />
      )}
    </div>
  );
};

export default V2CoachEngineTab;
