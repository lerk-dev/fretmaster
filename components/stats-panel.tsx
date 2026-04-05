'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Clock, 
  Target, 
  TrendingUp, 
  Calendar,
  Trophy,
  Activity
} from 'lucide-react';
import { 
  getStatsSummary, 
  getRecentStats, 
  getStatsByExerciseType,
  syncLocalBackupToServer 
} from '@/lib/stats-api';

interface StatsSummary {
  totalSessions: number;
  totalDuration: number;
  averageScore: number;
  averageAccuracy: number;
  lastPractice: string | null;
}

export function StatsPanel() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [recentStats, setRecentStats] = useState<any[]>([]);
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
        getRecentStats(7),
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
      return `${hours}小时${mins % 60}分钟`;
    }
    return `${mins}分钟`;
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '从未';
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN');
  };

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

  return (
    <div className="space-y-4">
      {/* 统计概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Trophy className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">练习次数</span>
            </div>
            <p className="text-2xl font-bold mt-2">{summary?.totalSessions || 0}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">总时长</span>
            </div>
            <p className="text-2xl font-bold mt-2">
              {formatDuration(summary?.totalDuration || 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">平均分</span>
            </div>
            <p className="text-2xl font-bold mt-2">
              {summary?.averageScore?.toFixed(1) || 0}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-4 w-4 text-purple-500" />
              <span className="text-sm text-muted-foreground">最近练习</span>
            </div>
            <p className="text-lg font-bold mt-2">
              {formatDate(summary?.lastPractice || '')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 练习类型统计 */}
      {Object.keys(exerciseTypes).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Activity className="h-5 w-5" />
              练习类型统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {Object.entries(exerciseTypes).map(([type, stats]: [string, any]) => (
                <div key={type} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div>
                    <p className="font-medium">{type}</p>
                    <p className="text-sm text-muted-foreground">
                      {stats.count} 次练习 · {formatDuration(stats.totalDuration)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-primary">{stats.avgScore.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">平均分</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 最近练习记录 */}
      {recentStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              最近7天练习记录
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentStats.slice(-5).reverse().map((stat, index) => (
                <div key={index} className="flex items-center justify-between p-2 border-b last:border-0">
                  <div>
                    <p className="font-medium">{stat.exerciseType}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(stat.date)} · {formatDuration(stat.duration)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm">得分: {stat.score}</span>
                    {stat.accuracy && (
                      <span className="text-sm text-green-600">
                        准确率: {(stat.accuracy * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 同步按钮 */}
      <Button 
        onClick={handleSync} 
        disabled={syncing}
        variant="outline"
        className="w-full"
      >
        {syncing ? '同步中...' : '同步本地备份数据'}
      </Button>

      {/* 刷新按钮 */}
      <Button 
        onClick={loadStats} 
        disabled={loading}
        variant="ghost"
        className="w-full"
      >
        {loading ? '刷新中...' : '刷新统计数据'}
      </Button>
    </div>
  );
}
