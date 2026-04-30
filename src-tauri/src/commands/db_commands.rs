use crate::db::stats;

#[tauri::command]
pub async fn save_practice_stats(
    exercise_type: String,
    exercise_detail: Option<String>,
    score: i32,
    duration: i32,
    accuracy: Option<f64>,
    notes: Option<String>,
) -> Result<i64, String> {
    let stats_data = stats::PracticeStats {
        id: None,
        exercise_type,
        exercise_detail,
        score,
        duration,
        accuracy,
        notes,
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
    stats::delete_stats_by_id(id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_all_practice_stats() -> Result<(), String> {
    stats::clear_all_stats()
        .map_err(|e| e.to_string())
}
