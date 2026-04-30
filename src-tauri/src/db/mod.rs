use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;

pub mod stats;

static DB_CONNECTION: Lazy<Mutex<Connection>> = Lazy::new(|| {
    let conn = init_db().expect("Failed to initialize database");
    Mutex::new(conn)
});

fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("FretMaster");
    std::fs::create_dir_all(&path).ok();
    path.push("fretmaster.db");
    path
}

fn init_db() -> SqliteResult<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;
    
    // 创建练习统计表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS practice_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exercise_type TEXT NOT NULL,
            exercise_detail TEXT,
            score INTEGER NOT NULL,
            duration INTEGER NOT NULL,
            accuracy REAL,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;
    
    // 创建练习会话表
    conn.execute(
        "CREATE TABLE IF NOT EXISTS practice_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_date DATE DEFAULT CURRENT_DATE,
            total_duration INTEGER DEFAULT 0,
            total_exercises INTEGER DEFAULT 0,
            average_score REAL,
            UNIQUE(session_date)
        )",
        [],
    )?;
    
    // 创建索引
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stats_type ON practice_stats(exercise_type)",
        [],
    )?;
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stats_date ON practice_stats(created_at)",
        [],
    )?;
    
    log::info!("SQLite database initialized at: {:?}", db_path);
    Ok(conn)
}

pub fn get_db() -> std::sync::MutexGuard<'static, Connection> {
    DB_CONNECTION.lock().unwrap()
}
