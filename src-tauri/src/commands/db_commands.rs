use crate::db::stats;

const MAX_STRING_LEN: usize = 500;
const MAX_NOTES_LEN: usize = 2000;
const MAX_DAYS: i32 = 3650;

#[tauri::command]
pub async fn save_practice_stats(
    exercise_type: String,
    exercise_detail: Option<String>,
    score: i32,
    duration: i32,
    accuracy: Option<f64>,
    notes: Option<String>,
) -> Result<i64, String> {
    if exercise_type.is_empty() || exercise_type.len() > MAX_STRING_LEN {
        return Err("exercise_type must be 1-500 characters".into());
    }
    if let Some(ref d) = exercise_detail {
        if d.len() > MAX_STRING_LEN {
            return Err("exercise_detail must be at most 500 characters".into());
        }
    }
    if score < 0 || score > 10000 {
        return Err("score must be between 0 and 10000".into());
    }
    if duration < 0 || duration > 86400 {
        return Err("duration must be between 0 and 86400 seconds".into());
    }
    if let Some(a) = accuracy {
        if a < 0.0 || a > 100.0 {
            return Err("accuracy must be between 0 and 100".into());
        }
    }
    if let Some(ref n) = notes {
        if n.len() > MAX_NOTES_LEN {
            return Err("notes must be at most 2000 characters".into());
        }
    }

    let stats_data = stats::PracticeStats {
        id: None,
        exercise_type,
        exercise_detail,
        score,
        duration,
        accuracy,
        notes,
        client_ip: None,
        created_at: None,
    };
    
    stats::save_practice_stats(&stats_data)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_all_practice_stats() -> Result<Vec<stats::PracticeStats>, String> {
    stats::get_all_stats()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_recent_practice_stats(days: i32) -> Result<Vec<stats::PracticeStats>, String> {
    if days < 1 || days > MAX_DAYS {
        return Err("days must be between 1 and 3650".into());
    }
    stats::get_recent_stats(days)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_practice_stats_summary() -> Result<stats::StatsSummary, String> {
    stats::get_stats_summary()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_stats_by_exercise_type() -> Result<Vec<stats::ExerciseTypeStats>, String> {
    stats::get_stats_by_exercise_type()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_practice_stat(id: i64) -> Result<(), String> {
    if id <= 0 {
        return Err("id must be positive".into());
    }
    stats::delete_stats_by_id(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_all_practice_stats() -> Result<(), String> {
    stats::clear_all_stats()
        .map_err(|e| e.to_string())
}

// ==================== 逐位置掌握度统计命令 ====================

const MAX_POSITION_ENTRIES: usize = 2000;
const MAX_INSTRUMENT_LEN: usize = 100;

fn validate_position_entry(e: &stats::PositionStatEntry) -> Result<(), String> {
    if e.string_index < 0 || e.string_index > 15 {
        return Err("string_index must be between 0 and 15".into());
    }
    if e.fret < 0 || e.fret > 36 {
        return Err("fret must be between 0 and 36".into());
    }
    if e.total < 0 || e.total > 1_000_000 {
        return Err("total must be between 0 and 1000000".into());
    }
    if e.correct < 0 || e.correct > e.total {
        return Err("correct must be between 0 and total".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn upsert_position_stats(
    instrument: String,
    entries: Vec<stats::PositionStatEntry>,
) -> Result<(), String> {
    if instrument.is_empty() || instrument.len() > MAX_INSTRUMENT_LEN {
        return Err("instrument must be 1-100 characters".into());
    }
    if entries.is_empty() || entries.len() > MAX_POSITION_ENTRIES {
        return Err("entries must contain 1-2000 items".into());
    }
    for e in &entries {
        validate_position_entry(e)?;
    }
    stats::upsert_position_stats(&instrument, &entries)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_position_stats(
    instrument: String,
) -> Result<Vec<stats::PositionStatRecord>, String> {
    if instrument.is_empty() || instrument.len() > MAX_INSTRUMENT_LEN {
        return Err("instrument must be 1-100 characters".into());
    }
    stats::get_position_stats(&instrument)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_position_stats(instrument: String) -> Result<(), String> {
    if instrument.is_empty() || instrument.len() > MAX_INSTRUMENT_LEN {
        return Err("instrument must be 1-100 characters".into());
    }
    stats::clear_position_stats(&instrument)
        .map_err(|e| e.to_string())
}
