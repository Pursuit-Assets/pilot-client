import React, { useState, useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/card';
import { ResponsiveLine } from '@nivo/line';
import { Loader2, User } from 'lucide-react';
import { Badge } from '../../../../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../../../components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '../../../../components/ui/dialog';
import { useUserTrends, useUsageHeatmap, useTaskTypeTrends, useUserDrilldown, useTopUsers } from '../hooks/usePlatformAnalytics';
import { formatChartDate } from '../../../../utils/dateHelpers';

const USER_COLORS = ['#4242EA', '#FF33FF', '#10B981', '#F59E0B', '#EF4444', '#6366F1', '#06B6D4', '#EC4899'];
const TASK_TYPE_COLORS = {
  conversation: '#4242EA',
  assessment: '#7c3aed',
  json: '#10b981',
  document: '#f59e0b',
  summarize: '#06b6d4',
  feedback: '#ef4444',
  unknown: '#94a3b8',
};
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatNumber = (num) => {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num?.toLocaleString() || '0';
};

const formatCost = (cost) => {
  if (!cost) return '$0.00';
  const val = parseFloat(cost);
  return val < 0.01 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`;
};

const shortenModel = (model) => {
  if (!model) return 'Unknown';
  return model.replace(/^(anthropic|openai|google|deepseek|x-ai|moonshotai|minimax)\//, '');
};

const LoadingState = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
  </div>
);

const EmptyState = ({ message }) => (
  <div className="text-center py-12 text-slate-400">{message || 'No data for this period'}</div>
);

const nivoTheme = {
  grid: { line: { stroke: '#f0f0f0' } },
  axis: {
    ticks: { text: { fontSize: 11, fill: '#94a3b8' } },
    legend: { text: { fontSize: 11, fill: '#94a3b8' } },
  },
  crosshair: { line: { stroke: '#4242EA', strokeDasharray: '6 4' } },
  tooltip: {
    container: {
      borderRadius: 8,
      border: '1px solid #e2e8f0',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    },
  },
};

const humanizeLabel = (str) => {
  if (!str) return 'Unknown';
  return str
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
};

const SliceTooltip = ({ slice }) => (
  <div style={{
    background: 'white',
    borderRadius: 8,
    border: '1px solid #e2e8f0',
    padding: '10px 14px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
    minWidth: 160,
  }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: '#1E1E1E', marginBottom: 6 }}>
      {slice.points[0]?.data.xFormatted}
    </div>
    {slice.points.map(point => (
      <div key={point.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: point.seriesColor || point.serieColor, flexShrink: 0 }} />
        <span style={{ color: '#64748b', flex: 1 }}>{humanizeLabel(point.seriesId || point.serieId)}</span>
        <span style={{ fontWeight: 600, color: '#1E1E1E' }}>{formatNumber(point.data.y)}</span>
      </div>
    ))}
  </div>
);

// ============================================================================
// USER DRILL-DOWN DIALOG
// ============================================================================
const SectionLabel = ({ children }) => (
  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</p>
);

const UserDrilldownDialog = ({ token, userId, userName, startDate, endDate, onClose }) => {
  const { data, isLoading } = useUserDrilldown(token, userId, startDate, endDate);

  const dailyLineData = useMemo(() => {
    const rows = data?.dailyUsage || [];
    if (rows.length === 0) return [];
    return [
      {
        id: 'Tokens',
        color: '#4242EA',
        data: rows.map(d => ({
          x: formatChartDate(d.date),
          y: parseInt(d.total_tokens, 10) || 0,
        })),
      },
      {
        id: 'Requests',
        color: '#FF33FF',
        data: rows.map(d => ({
          x: formatChartDate(d.date),
          y: parseInt(d.request_count, 10) || 0,
        })),
      },
    ];
  }, [data]);

  const activeDays = data?.dailyUsage?.length || 0;
  const firstReq = data?.summary?.first_request;
  const lastReq = data?.summary?.last_request;

  const safeDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const firstStr = safeDate(firstReq);
  const lastStr = safeDate(lastReq);
  const dateRange = firstStr && lastStr ? `${firstStr} – ${lastStr}` : null;

  const totalTaskTokens = data?.byTaskType?.reduce((s, t) => s + parseInt(t.total_tokens, 10), 0) || 1;

  return (
    <Dialog open={!!userId} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[#E3E3E3]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-[#4242EA] flex items-center justify-center text-white font-bold text-sm shrink-0">
                {(userName || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-[#1E1E1E]" style={{ fontFamily: 'var(--font-family)' }}>
                  {userName || `User #${userId}`}
                </p>
                {dateRange && (
                  <p className="text-xs text-slate-400 font-normal mt-0.5">
                    Active: {dateRange} · {activeDays} {activeDays === 1 ? 'day' : 'days'}
                  </p>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
        </div>

        {isLoading ? (
          <div className="px-6 py-12"><LoadingState /></div>
        ) : !data ? (
          <div className="px-6 py-12"><EmptyState message="No data" /></div>
        ) : (
          <div className="px-6 py-5 space-y-5">
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#4242EA]/5 border border-[#4242EA]/15 p-3 rounded-lg text-center">
                <p className="text-[10px] font-medium text-[#4242EA] uppercase tracking-wide">Total</p>
                <p className="text-xl font-bold text-[#1E1E1E] mt-0.5">{formatNumber(parseInt(data.summary?.total_tokens, 10))}</p>
                <p className="text-[10px] text-slate-400">tokens</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Prompt</p>
                <p className="text-xl font-bold text-[#1E1E1E] mt-0.5">{formatNumber(parseInt(data.summary?.prompt_tokens, 10))}</p>
                <p className="text-[10px] text-slate-400">tokens</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Completion</p>
                <p className="text-xl font-bold text-[#1E1E1E] mt-0.5">{formatNumber(parseInt(data.summary?.completion_tokens, 10))}</p>
                <p className="text-[10px] text-slate-400">tokens</p>
              </div>
              <div className="bg-slate-50 border border-slate-100 p-3 rounded-lg text-center">
                <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">Requests</p>
                <p className="text-xl font-bold text-[#1E1E1E] mt-0.5">{parseInt(data.summary?.request_count, 10)?.toLocaleString()}</p>
                <p className="text-[10px] text-slate-400">total</p>
              </div>
            </div>

            {/* Daily activity chart */}
            {dailyLineData.length > 0 && dailyLineData[0].data.length > 0 && (
              <div>
                <SectionLabel>Daily Activity</SectionLabel>
                <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-3">
                  <div style={{ height: 220 }}>
                    <ResponsiveLine
                      data={dailyLineData}
                      theme={nivoTheme}
                      colors={['#4242EA', '#FF33FF']}
                      margin={{ top: 10, right: 16, bottom: 40, left: 50 }}
                      xScale={{ type: 'point' }}
                      yScale={{ type: 'linear', min: 0, max: 'auto' }}
                      axisBottom={{ tickRotation: dailyLineData[0].data.length > 10 ? -45 : 0, tickSize: 5, tickPadding: 5 }}
                      axisLeft={{ format: formatNumber, tickSize: 5, tickPadding: 5 }}
                      pointSize={0}
                      useMesh
                      enableArea
                      areaOpacity={0.1}
                      curve="monotoneX"
                      enableSlices="x"
                      sliceTooltip={SliceTooltip}
                      legends={[
                        {
                          anchor: 'bottom',
                          direction: 'row',
                          translateY: 36,
                          itemWidth: 80,
                          itemHeight: 20,
                          symbolSize: 8,
                          symbolShape: 'circle',
                        },
                      ]}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bottom row: Model Usage + Task Types side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Model Usage table */}
              {data.byModel?.length > 0 && (
                <div>
                  <SectionLabel>Model Usage</SectionLabel>
                  <div className="border border-slate-100 rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50/80">
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wide">Model</TableHead>
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-right">Tokens</TableHead>
                          <TableHead className="text-[10px] font-semibold uppercase tracking-wide text-right">Reqs</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.byModel.map((m, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium text-sm">{shortenModel(m.model)}</TableCell>
                            <TableCell className="text-right text-sm">{formatNumber(parseInt(m.total_tokens, 10))}</TableCell>
                            <TableCell className="text-right text-sm text-slate-500">{parseInt(m.request_count, 10)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Task type bars */}
              {data.byTaskType?.length > 0 && (
                <div>
                  <SectionLabel>Task Types</SectionLabel>
                  <div className="space-y-2">
                    {data.byTaskType.map((t, i) => {
                      const tokens = parseInt(t.total_tokens, 10);
                      const pct = (tokens / totalTaskTokens) * 100;
                      const color = TASK_TYPE_COLORS[t.task_type] || USER_COLORS[i % USER_COLORS.length];
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-slate-600 capitalize">{t.task_type}</span>
                            <span className="text-xs text-slate-400">{formatNumber(tokens)} · {parseInt(t.request_count, 10)} reqs</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.max(pct, 3)}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

// ============================================================================
// HEATMAP COMPONENT
// ============================================================================
const UsageHeatmap = ({ data }) => {
  const [tooltip, setTooltip] = useState(null);

  const grid = useMemo(() => {
    const cells = {};
    let maxCount = 1;
    (data || []).forEach(d => {
      const key = `${d.day_of_week}-${d.hour}`;
      const count = parseInt(d.request_count, 10) || 0;
      cells[key] = count;
      if (count > maxCount) maxCount = count;
    });
    return { cells, maxCount };
  }, [data]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Hour labels */}
        <div className="flex ml-10 mb-1">
          {hours.map(h => (
            <div key={h} className="flex-1 text-center text-[9px] text-slate-400">
              {h % 3 === 0 ? `${h}:00` : ''}
            </div>
          ))}
        </div>
        {/* Rows */}
        {DAY_NAMES.map((day, di) => (
          <div key={di} className="flex items-center mb-0.5">
            <span className="w-10 text-xs text-slate-500 text-right pr-2">{day}</span>
            <div className="flex flex-1 gap-0.5">
              {hours.map(h => {
                const count = grid.cells[`${di}-${h}`] || 0;
                const intensity = count / grid.maxCount;
                const bg = count === 0
                  ? 'bg-slate-100'
                  : intensity > 0.75 ? 'bg-[#4242EA]'
                  : intensity > 0.5 ? 'bg-[#6b6bf0]'
                  : intensity > 0.25 ? 'bg-[#9e9ef5]'
                  : 'bg-[#c5c5fa]';
                return (
                  <div
                    key={h}
                    className={`flex-1 h-5 rounded-sm ${bg} cursor-default`}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setTooltip({
                        day, hour: h, count,
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                );
              })}
            </div>
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center justify-end gap-1 mt-2 mr-1">
          <span className="text-[10px] text-slate-400">Less</span>
          {['bg-slate-100', 'bg-[#c5c5fa]', 'bg-[#9e9ef5]', 'bg-[#6b6bf0]', 'bg-[#4242EA]'].map((c, i) => (
            <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
          ))}
          <span className="text-[10px] text-slate-400">More</span>
        </div>
      </div>

      {/* Floating tooltip */}
      {tooltip && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%) translateY(-6px)',
          }}
        >
          <div style={{
            background: 'white',
            borderRadius: 8,
            border: '1px solid #e2e8f0',
            padding: '6px 10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#1E1E1E' }}>
              {tooltip.day} {tooltip.hour}:00
            </div>
            <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
              {tooltip.count} {tooltip.count === 1 ? 'request' : 'requests'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================================
// MAIN TRENDS TAB
// ============================================================================
const TrendsTab = ({ token, startDate, endDate }) => {
  const [selectedUser, setSelectedUser] = useState(null);

  const { data: userTrendsData, isLoading: trendsLoading } = useUserTrends(token, startDate, endDate, 5);
  const { data: heatmapData, isLoading: heatmapLoading } = useUsageHeatmap(token, startDate, endDate);
  const { data: taskTrendsData, isLoading: taskTrendsLoading } = useTaskTypeTrends(token, startDate, endDate);
  const { data: topUsers, isLoading: usersLoading } = useTopUsers(token, startDate, endDate, 10);

  // Transform user trends into Nivo multi-series format
  const userLineData = useMemo(() => {
    if (!userTrendsData || userTrendsData.length === 0) return [];

    const userMap = {};
    const userDates = {};

    userTrendsData.forEach(row => {
      const name = row.first_name && row.last_name
        ? `${row.first_name} ${row.last_name.charAt(0)}.`
        : `User #${row.user_id}`;

      if (!userMap[row.user_id]) {
        userMap[row.user_id] = name;
        userDates[row.user_id] = [];
      }
      userDates[row.user_id].push({
        x: formatChartDate(row.date),
        y: parseInt(row.total_tokens, 10) || 0,
      });
    });

    return Object.entries(userMap).map(([uid, name], i) => ({
      id: name,
      color: USER_COLORS[i % USER_COLORS.length],
      data: userDates[uid],
    }));
  }, [userTrendsData]);

  // Transform task type trends into Nivo stacked area format
  // Exclude title_generation — it's an internal auto-task, not a meaningful user metric
  const HIDDEN_TASK_TYPES = new Set(['title_generation']);

  const taskLineData = useMemo(() => {
    if (!taskTrendsData || taskTrendsData.length === 0) return { series: [], taskTypes: [] };

    const taskTypes = new Set();
    const taskDates = {};

    taskTrendsData.forEach(row => {
      if (HIDDEN_TASK_TYPES.has(row.task_type)) return;
      taskTypes.add(row.task_type);
      if (!taskDates[row.task_type]) taskDates[row.task_type] = [];
      taskDates[row.task_type].push({
        x: formatChartDate(row.date),
        y: parseInt(row.total_tokens, 10) || 0,
      });
    });

    const taskTypeArr = Array.from(taskTypes);
    const series = taskTypeArr.map((type, i) => ({
      id: humanizeLabel(type),
      color: TASK_TYPE_COLORS[type] || USER_COLORS[i % USER_COLORS.length],
      data: taskDates[type],
    }));

    return { series, taskTypes: taskTypeArr };
  }, [taskTrendsData]);

  return (
    <div className="space-y-4">
      {/* User Drill-down Dialog */}
      {selectedUser && (
        <UserDrilldownDialog
          token={token}
          userId={selectedUser.user_id}
          userName={selectedUser.name}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {/* Row 1: User Usage Over Time + Heatmap — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="bg-white border border-[#E3E3E3] lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#1E1E1E]">Top User Token Usage Over Time</CardTitle>
            <CardDescription className="text-xs">Daily consumption for top 5 users</CardDescription>
          </CardHeader>
          <CardContent>
            {trendsLoading ? <LoadingState /> : userLineData.length === 0 ? <EmptyState /> : (
              <div style={{ height: 300 }}>
                <ResponsiveLine
                  data={userLineData}
                  theme={nivoTheme}
                  colors={userLineData.map(s => s.color)}
                  margin={{ top: 10, right: 16, bottom: 46, left: 50 }}
                  xScale={{ type: 'point' }}
                  yScale={{ type: 'linear', min: 0, max: 'auto' }}
                  axisBottom={{
                    tickRotation: (userLineData[0]?.data.length || 0) > 14 ? -45 : 0,
                    tickSize: 5,
                    tickPadding: 5,
                  }}
                  axisLeft={{
                    format: formatNumber,
                    tickSize: 5,
                    tickPadding: 5,
                  }}
                  pointSize={0}
                  useMesh
                  enableCrosshair
                  curve="monotoneX"
                  enableSlices="x"
                  sliceTooltip={SliceTooltip}
                  legends={[
                    {
                      anchor: 'bottom',
                      direction: 'row',
                      translateY: 42,
                      itemWidth: 110,
                      itemHeight: 20,
                      symbolSize: 10,
                      symbolShape: 'circle',
                    },
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border border-[#E3E3E3] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#1E1E1E]">Usage Heatmap</CardTitle>
            <CardDescription className="text-xs">Requests by day & hour (ET)</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[360px] overflow-y-auto">
            {heatmapLoading ? <LoadingState /> : !heatmapData || heatmapData.length === 0 ? <EmptyState /> : (
              <UsageHeatmap data={heatmapData} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Task Type Trends + Users Table — side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <Card className="bg-white border border-[#E3E3E3] lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#1E1E1E]">Task Type Trends</CardTitle>
            <CardDescription className="text-xs">Daily token usage by task type</CardDescription>
          </CardHeader>
          <CardContent>
            {taskTrendsLoading ? <LoadingState /> : taskLineData.series.length === 0 ? <EmptyState /> : (
              <div style={{ height: 300 }}>
                <ResponsiveLine
                  data={taskLineData.series}
                  theme={nivoTheme}
                  colors={taskLineData.series.map(s => s.color)}
                  margin={{ top: 10, right: 16, bottom: 46, left: 50 }}
                  xScale={{ type: 'point' }}
                  yScale={{ type: 'linear', min: 0, max: 'auto', stacked: true }}
                  axisBottom={{
                    tickRotation: (taskLineData.series[0]?.data.length || 0) > 14 ? -45 : 0,
                    tickSize: 5,
                    tickPadding: 5,
                  }}
                  axisLeft={{
                    format: formatNumber,
                    tickSize: 5,
                    tickPadding: 5,
                  }}
                  pointSize={0}
                  useMesh
                  enableArea
                  areaOpacity={0.6}
                  curve="monotoneX"
                  enableSlices="x"
                  sliceTooltip={SliceTooltip}
                  legends={[
                    {
                      anchor: 'bottom',
                      direction: 'row',
                      translateY: 42,
                      itemWidth: 130,
                      itemHeight: 20,
                      symbolSize: 10,
                      symbolShape: 'circle',
                    },
                  ]}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white border border-[#E3E3E3] lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-[#1E1E1E]">All Users</CardTitle>
            <CardDescription className="text-xs">Click any user to drill down</CardDescription>
          </CardHeader>
          <CardContent className="max-h-[360px] overflow-y-auto">
            {usersLoading ? <LoadingState /> : !topUsers || topUsers.length === 0 ? <EmptyState message="No user data yet" /> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Reqs</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topUsers.map((user, i) => {
                    const name = user.first_name && user.last_name
                      ? `${user.first_name} ${user.last_name}`
                      : `User #${user.user_id}`;
                    return (
                      <TableRow
                        key={user.user_id || i}
                        className="cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setSelectedUser({ user_id: user.user_id, name })}
                      >
                        <TableCell className="font-medium text-[#4242EA]">{name}</TableCell>
                        <TableCell className="text-right">{formatNumber(parseInt(user.total_tokens, 10))}</TableCell>
                        <TableCell className="text-right">{parseInt(user.request_count, 10).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{formatCost(user.estimated_cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TrendsTab;
