'use client';

import { useEffect, useState, useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Clock, 
  Target, 
  TrendingUp, 
  Calendar,
  Trophy,
  Activity,
  Flame,
  BarChart,
  PieChart as PieChartIcon,
  RefreshCw
} from 'lucide-react';
import { 
  getStatsSummary, 
  getRecentStats, 
  getStatsByExerciseType,
  syncLocalBackupToServer,
  PracticeStats 
} from '@/lib/stats-api';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts';

interface StatsSummary {
  totalSessions: number;
  totalDuration: number;
  averageScore: number;
  averageAccuracy: number;
  lastPractice: string | null;
}

// 图表颜色方案
const COLORS = [
  'hsl(142, 71%, 45%)',  // 绿色 - 主色
  'hsl(25, 95%, 53%)',   // 橙色 - 强调色
  'hsl(217, 91%, 60%)',  // 蓝色
  'hsl(271, 91%, 65%)',  // 紫色
  'hsl(47, 96%, 53%)',   // 黄色
  'hsl(0, 84%, 60%)',    // 红色
  'hsl(187, 85%, 53%)',  // 青色
  'hsl(340, 75%, 55%)',  // 粉色
];

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  'pitch_finding': '找音练习',
  'interval': '音程练习',
  'scale': '音阶练习',
  'chord': '和弦练习',
  'chord_progression': '和弦进行',
};

function getExerciseTypeLabel(type: string): string {
  return EXERCISE_TYPE_LABELS[type] || '其他'
}

export const StatsPanel = memo(function StatsPanel() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [recentStats, setRecentStats] = useState<PracticeStats[]>([]);
  const [exerciseTypes, setExerciseTypes] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const [summaryData, recentData, typeData] = await Promise.all([
        getStatsSummary(),
        getRecentStats(30),
        getStatsByExerciseType(),
      ]);
      setSummary(summaryData);
      setRecentStats(recentData);
      setExerciseTypes(typeData);
    } catch (error) {
      console.error('加载统计数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const count = await syncLocalBackupToServer();
      if (count > 0) {
        alert(`成功同步 ${count} 条本地备份数据`);
        loadStats();
      } else {
        alert('没有需要同步的本地数据');
      }
    } catch (error) {
      alert('同步失败: ' + error);
    } finally {
      setSyncing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      return `${hours}h${mins % 60}m`;
    }
    return `${mins}m`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '从未';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // ===== 图表数据准备 =====

  // 每日练习次数趋势
  const dailyTrendData = useMemo(() => {
    const dailyMap: Record<string, { date: string; count: number; duration: number; score: number }> = {};
    
    recentStats.forEach(stat => {
      const dateStr = stat.created_at || stat.date || '';
      if (!dateStr) return;
      const day = new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, count: 0, duration: 0, score: 0 };
      }
      dailyMap[day].count++;
      dailyMap[day].duration += stat.duration || 0;
      dailyMap[day].score += stat.score || 0;
    });

    return Object.values(dailyMap).map(d => ({
      ...d,
      avgScore: d.count > 0 ? Math.round(d.score / d.count) : 0,
    }));
  }, [recentStats]);

  // 练习类型分布（饼图）
  const exerciseTypePieData = useMemo(() => {
    return Object.entries(exerciseTypes).map(([type, stats]: [string, any], index) => ({
      name: getExerciseTypeLabel(type),
      value: stats.count,
      color: COLORS[index % COLORS.length],
      duration: stats.totalDuration,
    }));
  }, [exerciseTypes]);

  // 练习类型得分（柱状图）
  const exerciseTypeBarData = useMemo(() => {
    return Object.entries(exerciseTypes).map(([type, stats]: [string, any], index) => ({
      name: getExerciseTypeLabel(type),
      avgScore: stats.avgScore,
      count: stats.count,
      duration: Math.round(stats.totalDuration / 60),
      fill: COLORS[index % COLORS.length],
    }));
  }, [exerciseTypes]);

  // 最近练习得分趋势
  const scoreTrendData = useMemo(() => {
    return recentStats.slice().reverse().slice(-20).map((stat, i) => ({
      index: i + 1,
      score: stat.score || 0,
      accuracy: stat.accuracy ? Math.round(stat.accuracy * 100) : 0,
      type: getExerciseTypeLabel(stat.exercise_type || stat.exerciseType || ''),
    }));
  }, [recentStats]);

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = summary && (summary.totalSessions > 0 || recentStats.length > 0);

  return (
    <div className="space-y-4">
      {/* 统计概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">练习次数</span>
            </div>
            <p className="text-2xl font-bold mt-1">{summary?.totalSessions || 0}</p>
            <p className="text-[10px] text-muted-foreground">总练习</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">总时长</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {formatDuration(summary?.totalDuration || 0)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {summary?.totalDuration ? Math.round(summary.totalDuration / 60) : 0} 分钟
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-green-500" />
              <span className="text-xs text-muted-foreground">平均分</span>
            </div>
            <p className="text-2xl font-bold mt-1">
              {summary?.averageScore?.toFixed(1) || 0}
            </p>
            <p className="text-[10px] text-muted-foreground">
              准确率 {isNaN(summary?.averageAccuracy) ? 0 : Math.round((summary?.averageAccuracy || 0) * 100)}%
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-3">
            <div className="flex items-center space-x-2">
              <Flame className="h-4 w-4 text-purple-500" />
              <span className="text-xs text-muted-foreground">最近练习</span>
            </div>
            <p className="text-lg font-bold mt-1">
              {formatDate(summary?.lastPractice || '')}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {recentStats.length > 0 ? '近30天' : '暂无记录'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 图表区域 */}
      {hasData ? (
        <Tabs defaultValue="trend" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="trend" className="text-xs">
              <TrendingUp className="w-3 h-3 mr-1" />
              趋势
            </TabsTrigger>
            <TabsTrigger value="types" className="text-xs">
              <PieChartIcon className="w-3 h-3 mr-1" />
              类型分布
            </TabsTrigger>
            <TabsTrigger value="scores" className="text-xs">
              <BarChart className="w-3 h-3 mr-1" />
              得分对比
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <Activity className="w-3 h-3 mr-1" />
              得分走势
            </TabsTrigger>
          </TabsList>

          {/* 每日练习趋势 */}
          <TabsContent value="trend">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  每日练习趋势
                </CardTitle>
              </CardHeader>
              <CardContent>
                {dailyTrendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={dailyTrendData}>
                      <defs>
                        <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(142, 71%, 45%)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 18%)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(220, 13%, 8%)',
                          border: '1px solid hsl(220, 13%, 18%)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="count"
                        stroke="hsl(142, 71%, 45%)"
                        fill="url(#colorCount)"
                        name="练习次数"
                        strokeWidth={2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    暂无足够数据生成趋势图
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 练习类型分布（饼图） */}
          <TabsContent value="types">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4" />
                  练习类型分布
                </CardTitle>
              </CardHeader>
              <CardContent>
                {exerciseTypePieData.length > 0 ? (
                  <div className="flex items-center gap-4">
                    <ResponsiveContainer width="60%" height={200}>
                      <PieChart>
                        <Pie
                          data={exerciseTypePieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          paddingAngle={3}
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          labelLine={false}
                        >
                          {exerciseTypePieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'hsl(220, 13%, 8%)',
                            border: '1px solid hsl(220, 13%, 18%)',
                            borderRadius: '8px',
                            fontSize: '12px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {exerciseTypePieData.map((entry, i) => (
                        <div key={i} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-2.5 h-2.5 rounded-sm"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span>{entry.name}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono">{entry.value}次</span>
                            <span className="text-muted-foreground ml-1">
                              {formatDuration(entry.duration)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    暂无类型分布数据
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 练习类型得分对比（柱状图） */}
          <TabsContent value="scores">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart className="h-4 w-4" />
                  练习类型得分对比
                </CardTitle>
              </CardHeader>
              <CardContent>
                {exerciseTypeBarData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <RechartsBarChart data={exerciseTypeBarData} barSize={40}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 18%)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(220, 13%, 8%)',
                          border: '1px solid hsl(220, 13%, 18%)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="avgScore" name="平均分" radius={[4, 4, 0, 0]}>
                        {exerciseTypeBarData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    暂无得分对比数据
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 得分走势（折线图） */}
          <TabsContent value="history">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  最近练习得分走势
                </CardTitle>
              </CardHeader>
              <CardContent>
                {scoreTrendData.length > 1 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={scoreTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 18%)" />
                      <XAxis dataKey="index" tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <YAxis tick={{ fontSize: 10 }} stroke="hsl(220, 13%, 40%)" />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(220, 13%, 8%)',
                          border: '1px solid hsl(220, 13%, 18%)',
                          borderRadius: '8px',
                          fontSize: '12px',
                        }}
                        formatter={(value: number, name: string) => [
                          name === '得分' ? value : `${value}%`,
                          name,
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(142, 71%, 45%)"
                        strokeWidth={2}
                        dot={{ r: 3, fill: 'hsl(142, 71%, 45%)' }}
                        name="得分"
                      />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="hsl(25, 95%, 53%)"
                        strokeWidth={1.5}
                        strokeDasharray="5 5"
                        dot={false}
                        name="准确率"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    需要至少 2 条记录才能显示走势
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">暂无练习数据</p>
            <p className="text-xs text-muted-foreground mt-1">开始练习后，统计数据将自动记录</p>
          </CardContent>
        </Card>
      )}

      {/* 最近练习记录 */}
      {recentStats.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              最近练习记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {recentStats.slice(0, 8).map((stat, index) => (
                <div key={index} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <div>
                      <p className="text-sm font-medium">
                        {getExerciseTypeLabel(stat.exercise_type || stat.exerciseType || '')}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDate(stat.created_at || stat.date || '')} · {formatDuration(stat.duration || 0)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">
                      {stat.score || 0}分
                    </Badge>
                    {stat.accuracy && (
                      <span className="text-xs text-green-500">
                        {(stat.accuracy * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作按钮 */}
      <div className="flex gap-2">
        <Button 
          onClick={loadStats} 
          disabled={loading}
          variant="outline"
          className="flex-1"
          size="sm"
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? '刷新中...' : '刷新'}
        </Button>
        <Button 
          onClick={handleSync} 
          disabled={syncing}
          variant="outline"
          className="flex-1"
          size="sm"
        >
          {syncing ? '同步中...' : '同步备份'}
        </Button>
      </div>
    </div>
  );
})
