import React, { useState } from 'react';
import { Card, CardContent } from '../../../../components/ui/card';
import { Badge } from '../../../../components/ui/badge';
import {
  Loader2, Server, Database, BarChart3, Bot, RefreshCw,
  CloudCog, Globe, ChevronDown, ChevronUp, X, CheckCircle, EyeOff,
  Cog, Video, MessageSquare, FileSearch, ClipboardCheck,
} from 'lucide-react';
import { useMcpServerStatus, useMcpPgStatus, useMcpBqStatus } from '../hooks/useMcpStatus';
import {
  useExternalUsage, useRenderStatus, useRenderLogs, useRenderClientStatus, useUpdateErrorStatus,
  useGcpServicesStatus,
} from '../hooks/usePlatformAnalytics';

const formatNumber = (num) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num?.toLocaleString() || '0';
};

const StatusDot = ({ status }) => {
  const color =
    status === 'ok' || status === 'connected'
      ? 'bg-emerald-400'
      : status === 'loading'
        ? 'bg-amber-400 animate-pulse'
        : 'bg-red-400';

  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />;
};

const StatusBadge = ({ status }) => {
  if (status === 'ok' || status === 'connected') {
    return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">Live</Badge>;
  }

  if (status === 'loading') {
    return <Badge className="bg-amber-50 text-amber-700 border-amber-200">Checking</Badge>;
  }

  return <Badge className="bg-red-50 text-red-700 border-red-200">Down</Badge>;
};

const LatencyTag = ({ ms }) => {
  if (ms == null) return null;

  const color =
    ms < 300 ? 'text-emerald-600' : ms < 1000 ? 'text-amber-600' : 'text-red-600';

  return <span className={`text-xs font-mono ${color}`}>{ms}ms</span>;
};

const IntegrationCard = ({ icon: Icon, iconBg, title, subtitle, status, latencyMs, extra, isLoading, onRefresh, onClick, clickHint }) => (
  <Card
    className={`bg-white border border-[#E3E3E3] relative overflow-hidden ${onClick ? 'cursor-pointer hover:border-[#4242EA]/30 transition-colors' : ''}`}
    onClick={onClick}
  >
    {status === 'error' && (
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-red-400" />
    )}
    {(status === 'ok' || status === 'connected') && (
      <div className="absolute top-0 left-0 right-0 h-0.5 bg-emerald-400" />
    )}
    <CardContent className="pt-5 pb-4">
      <div className="flex items-start gap-4">
        <div className={`p-2.5 rounded-lg shrink-0 ${iconBg}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="text-sm font-semibold text-[#1E1E1E] truncate">{title}</h3>
            <StatusDot status={isLoading ? 'loading' : status} />
          </div>
          <p className="text-xs text-slate-400 mb-2">{subtitle}</p>
          <div className="flex items-center gap-3 flex-wrap">
            <StatusBadge status={isLoading ? 'loading' : status} />
            <LatencyTag ms={latencyMs} />
            {extra}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onRefresh && (
            <button
              onClick={(e) => { e.stopPropagation(); onRefresh(); }}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
          {clickHint}
        </div>
      </div>
    </CardContent>
  </Card>
);

const formatTimestamp = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const ErrorActionButton = ({ icon: Icon, label, onClick, className }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-md border transition-colors ${className}`}
    title={label}
  >
    <Icon className="h-3 w-3" />
    {label}
  </button>
);

const RenderLogsPanel = ({ token }) => {
  const { data: logsData, isLoading } = useRenderLogs(token, true);
  const updateError = useUpdateErrorStatus(token);

  const trackedErrors = logsData?.trackedErrors || [];
  const activeErrors = trackedErrors.filter(e => e.status === 'active');
  const ignoredErrors = trackedErrors.filter(e => e.status === 'ignored');

  const handleAction = (id, status) => {
    updateError.mutate({ id, status });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-400">Loading Render logs...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Active errors */}
      {activeErrors.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wider text-red-600 mb-2">
            Active Errors ({activeErrors.length})
          </h4>
          <div className="space-y-2">
            {activeErrors.map((err) => (
              <div key={err.id} className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-800 font-mono break-all">{err.error_message}</p>
                  <p className="text-xs text-red-500 mt-1">{formatTimestamp(err.error_timestamp)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ErrorActionButton
                    icon={EyeOff}
                    label="Ignore"
                    onClick={() => handleAction(err.id, 'ignored')}
                    className="border-slate-200 text-slate-500 hover:bg-slate-50"
                  />
                  <ErrorActionButton
                    icon={CheckCircle}
                    label="Fixed"
                    onClick={() => handleAction(err.id, 'fixed')}
                    className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  />
                  <ErrorActionButton
                    icon={X}
                    label="Remove"
                    onClick={() => handleAction(err.id, 'removed')}
                    className="border-red-200 text-red-500 hover:bg-red-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeErrors.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">
          No active errors in the last 7 days
        </div>
      )}

      {/* Ignored errors (collapsed) */}
      {ignoredErrors.length > 0 && (
        <details className="group">
          <summary className="text-xs font-semibold uppercase tracking-wider text-slate-400 cursor-pointer hover:text-slate-600">
            Ignored ({ignoredErrors.length})
          </summary>
          <div className="space-y-2 mt-2">
            {ignoredErrors.map((err) => (
              <div key={err.id} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg opacity-60">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-600 font-mono break-all">{err.error_message}</p>
                  <p className="text-xs text-slate-400 mt-1">{formatTimestamp(err.error_timestamp)}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <ErrorActionButton
                    icon={CheckCircle}
                    label="Fixed"
                    onClick={() => handleAction(err.id, 'fixed')}
                    className="border-emerald-200 text-emerald-600 hover:bg-emerald-50"
                  />
                  <ErrorActionButton
                    icon={X}
                    label="Remove"
                    onClick={() => handleAction(err.id, 'removed')}
                    className="border-red-200 text-red-500 hover:bg-red-50"
                  />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

const IntegrationsStatusTab = ({ token, startDate, endDate }) => {
  const [renderExpanded, setRenderExpanded] = useState(false);

  const { data: serverData, isLoading: serverLoading, isError: serverError, refetch: refetchServer } = useMcpServerStatus();
  const { data: pgData, isLoading: pgLoading, isError: pgError, refetch: refetchPg } = useMcpPgStatus();
  const { data: bqData, isLoading: bqLoading, isError: bqError, refetch: refetchBq } = useMcpBqStatus();
  const { data: externalData, isLoading: extLoading } = useExternalUsage(token, startDate, endDate);
  const { data: renderData, isLoading: renderLoading, isError: renderError, refetch: refetchRender } = useRenderStatus(token);
  const { data: clientData, isLoading: clientLoading, isError: clientError, refetch: refetchClient } = useRenderClientStatus(token);
  const { data: gcpServices, isLoading: gcpLoading, refetch: refetchGcp } = useGcpServicesStatus(token);

  const anthropicData = externalData?.anthropic?.usage?.data;

  const anthropicTotals = React.useMemo(() => {
    if (!anthropicData) return null;
    let input = 0, output = 0, cache = 0;
    anthropicData.forEach(bucket => {
      (bucket.results || []).forEach(r => {
        input += r.uncached_input_tokens || 0;
        output += r.output_tokens || 0;
        cache += r.cache_read_input_tokens || 0;
      });
    });
    if (input + output === 0) return null;
    return { input, output, cache, total: input + output + cache };
  }, [anthropicData]);

  const serverStatus = serverError ? 'error' : serverData?.status || 'loading';
  const pgStatus = pgError ? 'error' : pgData?.status || 'loading';
  const bqStatus = bqError ? 'error' : bqData?.status || 'loading';
  const rStatus = renderError ? 'error' : renderData?.status || 'loading';
  const cStatus = clientError ? 'error' : clientData?.status || 'loading';

  const gcpAllOk = gcpServices?.every(s => s.status === 'ok' || s.status === 'no_health_check') ?? false;

  const allConnected =
    serverStatus === 'ok' &&
    pgStatus === 'connected' &&
    bqStatus === 'connected' &&
    rStatus === 'ok' &&
    cStatus === 'ok' &&
    gcpAllOk;

  const anyLoading = serverLoading || pgLoading || bqLoading || renderLoading || clientLoading || gcpLoading;

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
        allConnected
          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          : 'bg-amber-50 text-amber-700 border border-amber-200'
      }`}>
        <StatusDot status={allConnected ? 'ok' : anyLoading ? 'loading' : 'error'} />
        {allConnected
          ? 'All integrations operational'
          : anyLoading
            ? 'Checking integration status...'
            : 'One or more integrations are down'}
      </div>

      {/* Status cards grid — 3 cols, 2 rows */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* Render Server — clickable to expand logs */}
        <IntegrationCard
          icon={CloudCog}
          iconBg="bg-teal-500"
          title="Render Server"
          subtitle="test-pilot-server · Oregon"
          status={rStatus}
          latencyMs={renderData?.latencyMs}
          isLoading={renderLoading}
          onRefresh={refetchRender}
          onClick={() => setRenderExpanded(!renderExpanded)}
          clickHint={
            renderExpanded
              ? <ChevronUp className="h-4 w-4 text-slate-400" />
              : <ChevronDown className="h-4 w-4 text-slate-400" />
          }
          extra={
            renderData?.url && (
              <span className="text-xs text-slate-500 truncate max-w-[160px]">
                {renderData.url.replace('https://', '')}
              </span>
            )
          }
        />

        {/* Render Client — the deployed pilot-client static site */}
        <IntegrationCard
          icon={Globe}
          iconBg="bg-emerald-600"
          title="Render Client"
          subtitle={
            clientData?.name
              ? `${clientData.name}${clientData.branch ? ` · ${clientData.branch}` : ''} · Static Site`
              : 'pursuit-client · Static Site'
          }
          status={cStatus}
          latencyMs={clientData?.latencyMs}
          isLoading={clientLoading}
          onRefresh={refetchClient}
          extra={
            <>
              {clientData?.siteUrl && (
                <a
                  href={clientData.siteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline truncate max-w-[160px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {clientData.siteUrl.replace('https://', '')}
                </a>
              )}
              {clientData?.deployFinishedAt && (
                <span className="text-xs text-slate-500">
                  Shipped <span className="font-medium">{formatTimestamp(clientData.deployFinishedAt)}</span>
                </span>
              )}
            </>
          }
        />

        <IntegrationCard
          icon={Database}
          iconBg="bg-indigo-500"
          title="Cloud SQL (Postgres)"
          subtitle="segundo-db · us-central1"
          status={pgStatus}
          latencyMs={pgData?.latencyMs}
          isLoading={pgLoading}
          onRefresh={refetchPg}
          extra={
            pgData?.status === 'error' && pgData?.message && (
              <span className="text-xs text-red-500 truncate max-w-[160px]" title={pgData.message}>
                {pgData.message}
              </span>
            )
          }
        />

        <IntegrationCard
          icon={BarChart3}
          iconBg="bg-violet-500"
          title="BigQuery"
          subtitle="pursuit-ops · pilot_agent_public"
          status={bqStatus}
          latencyMs={bqData?.latencyMs}
          isLoading={bqLoading}
          onRefresh={refetchBq}
          extra={
            bqData?.status === 'error' && bqData?.message && (
              <span className="text-xs text-red-500 truncate max-w-[160px]" title={bqData.message}>
                {bqData.message}
              </span>
            )
          }
        />

        <IntegrationCard
          icon={Server}
          iconBg="bg-[#4242EA]"
          title="MCP Server"
          subtitle="pursuit-db-mcp · Cloud Run"
          status={serverStatus}
          latencyMs={serverData?.latencyMs}
          isLoading={serverLoading}
          onRefresh={refetchServer}
          extra={
            serverData?.authMode && (
              <span className="text-xs text-slate-500">
                Auth: <span className="font-medium">{serverData.authMode}</span>
              </span>
            )
          }
        />

        <IntegrationCard
          icon={Bot}
          iconBg="bg-orange-500"
          title="Claude Teams (Anthropic)"
          subtitle="Token usage via Anthropic API"
          status={extLoading ? 'loading' : anthropicTotals ? 'ok' : 'error'}
          isLoading={extLoading}
          extra={
            anthropicTotals ? (
              <span className="text-xs text-slate-500">
                {formatNumber(anthropicTotals.input + anthropicTotals.output)} tokens
                <span className="text-slate-300 mx-1">·</span>
                In: {formatNumber(anthropicTotals.input)}
                <span className="text-slate-300 mx-1">·</span>
                Out: {formatNumber(anthropicTotals.output)}
                <span className="text-slate-300 mx-1">·</span>
                Cache: {formatNumber(anthropicTotals.cache)}
              </span>
            ) : !extLoading ? (
              <span className="text-xs text-slate-400">No usage data</span>
            ) : null
          }
        />
      </div>

      {/* GCP Cloud Run / Cloud Function services */}
      {gcpLoading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking GCP services...
        </div>
      ) : gcpServices && gcpServices.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">GCP Pipeline Services</p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {gcpServices.map((svc) => {
              const GCP_ICONS = {
                'task-analysis': Cog,
                'loom-transcript-analyzer': Video,
                'feedback-sentiment-analysis': MessageSquare,
                'application-analyzer': FileSearch,
                'weekly-feedback-reports': ClipboardCheck,
              };
              const GCP_COLORS = {
                'task-analysis': 'bg-blue-500',
                'loom-transcript-analyzer': 'bg-pink-500',
                'feedback-sentiment-analysis': 'bg-cyan-500',
                'application-analyzer': 'bg-amber-500',
                'weekly-feedback-reports': 'bg-indigo-600',
              };
              const IconComp = GCP_ICONS[svc.id] || Cog;
              const iconBg = GCP_COLORS[svc.id] || 'bg-slate-500';
              const lastRanTs = svc.lastRun || svc.lastScheduledRun;
              const lastRanLabel = lastRanTs ? formatTimestamp(lastRanTs) : null;

              return (
                <IntegrationCard
                  key={svc.id}
                  icon={IconComp}
                  iconBg={iconBg}
                  title={svc.name}
                  subtitle={svc.subtitle}
                  status={svc.status === 'no_health_check' ? 'ok' : svc.status === 'timeout' ? 'loading' : svc.status || 'loading'}
                  latencyMs={svc.latencyMs}
                  isLoading={false}
                  extra={
                    <span className="flex items-center gap-2 flex-wrap">
                      {svc.status === 'timeout' && (
                        <span className="text-xs text-amber-500">Cold start timeout</span>
                      )}
                      {svc.error && svc.status !== 'timeout' && (
                        <span className="text-xs text-red-500 truncate max-w-[160px]" title={svc.error}>{svc.error}</span>
                      )}
                      {lastRanLabel && (
                        <span className="text-xs text-slate-400">
                          Last ran: <span className="font-medium text-slate-500">{lastRanLabel}</span>
                        </span>
                      )}
                    </span>
                  }
                />
              );
            })}

          </div>
        </div>
      )}

      {/* Render expandable logs/errors panel */}
      {renderExpanded && (
        <Card className="bg-white border border-[#E3E3E3]">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[#1E1E1E]">Render Server Logs & Errors</h3>
              <span className="text-xs text-slate-400">Last 7 days</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              <RenderLogsPanel token={token} />
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default IntegrationsStatusTab;
