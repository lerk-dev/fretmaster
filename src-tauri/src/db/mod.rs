use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;
use once_cell::sync::Lazy;
use std::sync::PoisonError;

pub mod stats;

static DB_CONNECTION: Lazy<Mutex<Connection>> = Lazy::new(|| {
    // 🚨 panic 信息必须带**路径 + 原始错误**（P3-15）：这是本应用唯一一次「数据库不可用」
    //    的致命失败，只报 "Failed to initialize database" 会让排查完全无从下手
    //    （是目录不可写？磁盘满？文件被另一个实例占用？还是 schema 迁移失败？）。
    let path = get_db_path();
    let conn = init_db().unwrap_or_else(|e| {
        panic!(
            "FretMaster 数据库初始化失败：{}（原始错误：{}）。\
             常见原因：目录不可写 / 磁盘已满 / 文件被另一个实例占用。",
            path.display(),
            e
        )
    });
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
            client_ip TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    // 已存在的表添加 client_ip 列（幂等操作，列已存在时忽略错误）
    let _ = conn.execute("ALTER TABLE practice_stats ADD COLUMN client_ip TEXT", []);
    let _ = conn.execute("CREATE INDEX IF NOT EXISTS idx_stats_ip ON practice_stats(client_ip)", []);
    
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

    // 创建逐位置掌握度统计表（找音练习按 弦×品 记录对错）
    conn.execute(
        "CREATE TABLE IF NOT EXISTS position_stats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            instrument TEXT NOT NULL,
            string_index INTEGER NOT NULL,
            fret INTEGER NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            correct INTEGER NOT NULL DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(instrument, string_index, fret)
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
    DB_CONNECTION.lock().unwrap_or_else(PoisonError::into_inner)
}
