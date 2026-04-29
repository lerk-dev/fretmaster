# FretMaster 统计数据存储功能

## ✅ 已完成配置

### 1. 后端 API（路由器上）
- **API 地址**: `http://192.168.123.2/cgi-bin/stats`
- **支持方法**: GET（读取）、POST（保存）、OPTIONS（跨域预检）
- **数据存储**: `/www/fretmaster/data/stats.json`

### 2. 前端模块
- **API 模块**: `lib/stats-api.ts` - 数据操作函数
- **统计面板**: `components/stats-panel.tsx` - 统计展示组件

## 🚀 使用方法

### 在练习页面保存数据

```typescript
import { savePracticeStats } from '@/lib/stats-api';

// 练习完成后保存数据
const handlePracticeComplete = async (score: number, duration: number) => {
  try {
    await savePracticeStats({
      exerciseType: '和弦转换', // 练习类型
      score: score,             // 得分
      duration: duration,       // 练习时长（秒）
      accuracy: 0.85,           // 准确率（可选）
      notes: '练习备注'         // 备注（可选）
    });
    console.log('练习数据已保存');
  } catch (error) {
    console.error('保存失败:', error);
  }
};
```

### 显示统计面板

```typescript
import { StatsPanel } from '@/components/stats-panel';

// 在页面中添加统计面板
export default function Page() {
  return (
    <div>
      <h1>练习统计</h1>
      <StatsPanel />
    </div>
  );
}
```

### 获取统计数据

```typescript
import { 
  getAllPracticeStats, 
  getStatsSummary, 
  getRecentStats 
} from '@/lib/stats-api';

// 获取所有数据
const allStats = await getAllPracticeStats();

// 获取统计摘要
const summary = await getStatsSummary();
console.log(`总练习次数: ${summary.totalSessions}`);
console.log(`平均分: ${summary.averageScore}`);

// 获取最近7天数据
const recent = await getRecentStats(7);
```

## 📊 数据格式

```typescript
interface PracticeStats {
  id?: number;           // 自动生成的ID
  date: string;          // ISO格式日期时间
  exerciseType: string;  // 练习类型
  score: number;         // 得分
  duration: number;      // 练习时长（秒）
  accuracy?: number;     // 准确率（0-1）
  notes?: string;        // 备注
}
```

## 🔧 测试 API

在浏览器控制台测试：

```javascript
// 保存数据
fetch('/cgi-bin/stats', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    exerciseType: '测试',
    score: 100,
    duration: 60
  })
}).then(r => r.json()).then(console.log);

// 读取数据
fetch('/cgi-bin/stats')
  .then(r => r.json())
  .then(console.log);
```

## 📁 文件位置

- **API 脚本**: `/www/cgi-bin/stats`
- **数据文件**: `/www/fretmaster/data/stats.json`
- **前端 API**: `lib/stats-api.ts`
- **统计面板**: `components/stats-panel.tsx`

## ⚠️ 注意事项

1. **跨域问题**: API 已配置 CORS，支持所有来源
2. **本地备份**: 网络失败时会自动保存到 LocalStorage
3. **数据同步**: 可以使用 `syncLocalBackupToServer()` 同步本地数据
4. **数据格式**: 每行一个 JSON 对象，不要手动编辑数据文件

## 🔒 数据安全

- 数据存储在路由器本地，不上传到互联网
- 建议定期备份 `/www/fretmaster/data/stats.json`
- 可以通过 SSH 导出数据：`scp root@192.168.123.2:/www/fretmaster/data/stats.json ./`
