use rusqlite::params;
use serde::{Deserialize, Serialize};
// use chrono::{DateTime, Utc};
use crate::db::get_db;

// 🚨 返回值统一用 `anyhow::Result`（2026-10-31 审计第 4 项）：`get_db()` 现在会返回
//    `Err(说明)`（数据库初始化失败时不再 panic 整个进程），而 `rusqlite::Result`
//    装不下那个 String。anyhow 两种错误都能吃，命令层照旧 `.map_err(|e| e.to_string())`。
type SqliteResult<T> = anyhow::Result<T>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeStats {
    pub id: Option<i64>,
    pub exercise_type: String,
    pub exercise_detail: Option<String>,
    pub score: i32,
    pub duration: i32,
    pub accuracy: Option<f64>,
    pub notes: Option<String>,
    pub client_ip: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatsSummary {
    pub total_sessions: i64,
    pub total_duration: i64,
    pub average_score: f64,
    pub average_accuracy: f64,
    pub last_practice: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExerciseTypeStats {
    pub exercise_type: String,
    pub count: i64,
    pub avg_score: f64,
    pub total_duration: i64,
}

pub fn save_practice_stats(stats: &PracticeStats) -> SqliteResult<i64> {
    let db = get_db()?;
    // Tauri 端是本地设备，client_ip 设为 "local" 表示本地练习
    let client_ip = stats.client_ip.clone().unwrap_or_else(|| "local".to_string());

    // 🚨 两条语句必须同事务（2026-10-31 审计第 10 项）：autocommit 下如果进程在
    //    两次 execute 之间被杀 / 磁盘满，就会出现「明细有、会话合计没有」
    //    （或反过来），统计页的数字与明细从此对不上且无法自愈。
    let tx = db.unchecked_transaction()?;
    tx.execute(
        "INSERT INTO practice_stats (exercise_type, exercise_detail, score, duration, accuracy, notes, client_ip)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            stats.exercise_type,
            stats.exercise_detail,
            stats.score,
            stats.duration,
            stats.accuracy,
            stats.notes,
            client_ip
        ],
    )?;

    let id = tx.last_insert_rowid();

    // 更新会话统计
    update_session_stats(&tx, stats.duration, stats.score)?;
    tx.commit()?;

    Ok(id)
}

fn update_session_stats(db: &rusqlite::Connection, duration: i32, _score: i32) -> SqliteResult<()> {
    db.execute(
        "INSERT INTO practice_sessions (session_date, total_duration, total_exercises)
         VALUES (CURRENT_DATE, ?1, 1)
         ON CONFLICT(session_date) DO UPDATE SET
         total_duration = total_duration + ?1,
         total_exercises = total_exercises + 1",
        params![duration],
    )?;
    Ok(())
}

pub fn get_all_stats() -> SqliteResult<Vec<PracticeStats>> {
    let db = get_db()?;
    let mut stmt = db.prepare(
        "SELECT id, exercise_type, exercise_detail, score, duration, accuracy, notes, client_ip, created_at
         FROM practice_stats
         ORDER BY created_at DESC"
    )?;

    let stats = stmt.query_map([], |row| {
        Ok(PracticeStats {
            id: row.get(0)?,
            exercise_type: row.get(1)?,
            exercise_detail: row.get(2)?,
            score: row.get(3)?,
            duration: row.get(4)?,
            accuracy: row.get(5)?,
            notes: row.get(6)?,
            client_ip: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    Ok(stats.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_recent_stats(days: i32) -> SqliteResult<Vec<PracticeStats>> {
    let db = get_db()?;
    let mut stmt = db.prepare(
        "SELECT id, exercise_type, exercise_detail, score, duration, accuracy, notes, client_ip, created_at
         FROM practice_stats
         WHERE created_at >= datetime('now', ?1)
         ORDER BY created_at DESC"
    )?;

    let stats = stmt.query_map(params![format!("-{} days", days)], |row| {
        Ok(PracticeStats {
            id: row.get(0)?,
            exercise_type: row.get(1)?,
            exercise_detail: row.get(2)?,
            score: row.get(3)?,
            duration: row.get(4)?,
            accuracy: row.get(5)?,
            notes: row.get(6)?,
            client_ip: row.get(7)?,
            created_at: row.get(8)?,
        })
    })?;

    Ok(stats.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn get_stats_summary() -> SqliteResult<StatsSummary> {
    let db = get_db()?;
    
    let (total_sessions, total_duration, avg_score, avg_accuracy): (i64, i64, f64, f64) = db.query_row(
        "SELECT 
            COUNT(*),
            COALESCE(SUM(duration), 0),
            COALESCE(AVG(score), 0.0),
            COALESCE(AVG(accuracy), 0.0)
         FROM practice_stats",
        [],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    
    let last_practice: Option<String> = db.query_row(
        "SELECT MAX(created_at) FROM practice_stats",
        [],
        |row| row.get(0),
    ).ok();
    
    Ok(StatsSummary {
        total_sessions,
        total_duration,
        average_score: (avg_score * 100.0).round() / 100.0,
        average_accuracy: (avg_accuracy * 100.0).round() / 100.0,
        last_practice,
    })
}

pub fn get_stats_by_exercise_type() -> SqliteResult<Vec<ExerciseTypeStats>> {
    let db = get_db()?;
    let mut stmt = db.prepare(
        "SELECT 
            exercise_type,
            COUNT(*) as count,
            AVG(score) as avg_score,
            SUM(duration) as total_duration
         FROM practice_stats
         GROUP BY exercise_type
         ORDER BY count DESC"
    )?;
    
    let stats = stmt.query_map([], |row| {
        Ok(ExerciseTypeStats {
            exercise_type: row.get(0)?,
            count: row.get(1)?,
            avg_score: row.get::<_, f64>(2)?,
            total_duration: row.get(3)?,
        })
    })?;
    
    Ok(stats.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub fn delete_stats_by_id(id: i64) -> SqliteResult<()> {
    let db = get_db()?;
    db.execute(
        "DELETE FROM practice_stats WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn clear_all_stats() -> SqliteResult<()> {
    let db = get_db()?;
    // 🚨 同事务：清了一半就失败会留下「明细已清、会话合计还在」这种自相矛盾的状态
    //    （统计页显示今天练了 30 分钟，但一条记录都没有，且用户无法修复）。
    let tx = db.unchecked_transaction()?;
    tx.execute("DELETE FROM practice_stats", [])?;
    tx.execute("DELETE FROM practice_sessions", [])?;
    tx.execute("DELETE FROM position_stats", [])?;
    tx.execute("DELETE FROM sqlite_sequence WHERE name='practice_stats'", [])?;
    tx.execute("DELETE FROM sqlite_sequence WHERE name='practice_sessions'", [])?;
    tx.execute("DELETE FROM sqlite_sequence WHERE name='position_stats'", [])?;
    tx.commit()?;
    Ok(())
}

// ==================== 逐位置掌握度统计 ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionStatEntry {
    pub string_index: i32,
    pub fret: i32,
    pub total: i32,
    pub correct: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PositionStatRecord {
    pub string_index: i32,
    pub fret: i32,
    pub total: i32,
    pub correct: i32,
}

/// 批量写入位置统计（以 (instrument, string_index, fret) 为唯一键覆盖）
pub fn upsert_position_stats(instrument: &str, entries: &[PositionStatEntry]) -> SqliteResult<()> {
    let db = get_db()?;
    // 🚨 同事务：原先每行一次 autocommit ⇒ 2000 行 = 2000 次 fsync（接口明显卡顿），
    //    且中途失败会留下「只写了一半」的掌握度（比完全不写更难查）。
    let tx = db.unchecked_transaction()?;
    for e in entries {
        tx.execute(
            "INSERT INTO position_stats (instrument, string_index, fret, total, correct, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, CURRENT_TIMESTAMP)
             ON CONFLICT(instrument, string_index, fret) DO UPDATE SET
                total = excluded.total,
                correct = excluded.correct,
                updated_at = CURRENT_TIMESTAMP",
            params![instrument, e.string_index, e.fret, e.total, e.correct],
        )?;
    }
    tx.commit()?;
    Ok(())
}

/// 读取指定乐器的全部位置统计
pub fn get_position_stats(instrument: &str) -> SqliteResult<Vec<PositionStatRecord>> {
    let db = get_db()?;
    let mut stmt = db.prepare(
        "SELECT string_index, fret, total, correct
         FROM position_stats
         WHERE instrument = ?1
         ORDER BY string_index, fret",
    )?;

    let stats = stmt.query_map(params![instrument], |row| {
        Ok(PositionStatRecord {
            string_index: row.get(0)?,
            fret: row.get(1)?,
            total: row.get(2)?,
            correct: row.get(3)?,
        })
    })?;

    Ok(stats.collect::<rusqlite::Result<Vec<_>>>()?)
}

/// 清空指定乐器的位置统计
pub fn clear_position_stats(instrument: &str) -> SqliteResult<()> {
    let db = get_db()?;
    db.execute("DELETE FROM position_stats WHERE instrument = ?1", params![instrument])?;
    Ok(())
}


#[cfg(test)]
mod tests {
    /// 🚨 源码护栏：三处「多语句写入」必须整体包在事务里（审计 2026-10-31 第 10 项）。
    ///
    /// 为什么用静态检查而不是行为测试：这几个函数直接操作**用户真实的** SQLite 文件，
    /// 行为测试会往用户的统计里写垃圾数据。而这里要钉的性质（「所有写语句都在同一个
    /// 事务里」）本身是结构性的 —— 一旦有人新增一条 `db.execute(...)` 就会失败。
    const SOURCE: &str = include_str!("stats.rs");

    fn fn_body(name: &str) -> String {
        let start = SOURCE
            .find(&format!("pub fn {name}"))
            .unwrap_or_else(|| panic!("找不到函数 {name} —— 锚点失效"));
        let rest = &SOURCE[start..];
        // 函数体截到下一个顶层闭合花括号（这几个函数体内没有嵌套的顶层花括号）
        let end = rest.find("\n}\n").map(|i| i + 2).unwrap_or(rest.len());
        rest[..end].to_string()
    }

    #[test]
    fn multi_statement_writes_are_wrapped_in_a_transaction() {
        for name in ["save_practice_stats", "clear_all_stats", "upsert_position_stats"] {
            let body = fn_body(name);
            assert!(
                body.contains("unchecked_transaction()"),
                "{name} 的多条写语句没有包在事务里 —— 中途失败会留下半批数据"
            );
            assert!(body.contains("tx.commit()"), "{name} 忘了 commit");
            assert!(
                !body.contains("db.execute("),
                "{name} 里还有绕过事务的 db.execute(...)；写操作必须走 tx.execute"
            );
        }
    }

    #[test]
    fn save_practice_stats_writes_detail_and_session_in_one_tx() {
        let body = fn_body("save_practice_stats");
        // 明细 + 会话合计必须一起提交，否则统计页数字与明细对不上
        assert!(body.contains("INSERT INTO practice_stats"));
        assert!(body.contains("update_session_stats(&tx"));
    }
}
