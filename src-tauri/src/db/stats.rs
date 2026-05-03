use rusqlite::{params, Result as SqliteResult};
use serde::{Deserialize, Serialize};
// use chrono::{DateTime, Utc};
use crate::db::get_db;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PracticeStats {
    pub id: Option<i64>,
    pub exercise_type: String,
    pub exercise_detail: Option<String>,
    pub score: i32,
    pub duration: i32,
    pub accuracy: Option<f64>,
    pub notes: Option<String>,
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
    let db = get_db();
    db.execute(
        "INSERT INTO practice_stats (exercise_type, exercise_detail, score, duration, accuracy, notes)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            stats.exercise_type,
            stats.exercise_detail,
            stats.score,
            stats.duration,
            stats.accuracy,
            stats.notes
        ],
    )?;
    
    let id = db.last_insert_rowid();
    
    // 更新会话统计
    update_session_stats(&db, stats.duration, stats.score)?;
    
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
    let db = get_db();
    let mut stmt = db.prepare(
        "SELECT id, exercise_type, exercise_detail, score, duration, accuracy, notes, created_at
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
            created_at: row.get(7)?,
        })
    })?;
    
    stats.collect()
}

pub fn get_recent_stats(days: i32) -> SqliteResult<Vec<PracticeStats>> {
    let db = get_db();
    let mut stmt = db.prepare(
        "SELECT id, exercise_type, exercise_detail, score, duration, accuracy, notes, created_at
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
            created_at: row.get(7)?,
        })
    })?;
    
    stats.collect()
}

pub fn get_stats_summary() -> SqliteResult<StatsSummary> {
    let db = get_db();
    
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
    let db = get_db();
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
    
    stats.collect()
}

pub fn delete_stats_by_id(id: i64) -> SqliteResult<()> {
    let db = get_db();
    db.execute(
        "DELETE FROM practice_stats WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

pub fn clear_all_stats() -> SqliteResult<()> {
    let db = get_db();
    db.execute("DELETE FROM practice_stats", [])?;
    db.execute("DELETE FROM practice_sessions", [])?;
    db.execute("DELETE FROM sqlite_sequence WHERE name='practice_stats'", [])?;
    db.execute("DELETE FROM sqlite_sequence WHERE name='practice_sessions'", [])?;
    Ok(())
}
