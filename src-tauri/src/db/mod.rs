use rusqlite::{Connection, Result as SqliteResult};
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::MutexGuard;
use once_cell::sync::Lazy;
use std::sync::PoisonError;
use std::time::Duration;

pub mod stats;

/// 数据库状态：**初始化可以失败**，失败信息留在这里供命令层读取。
///
/// ## 🚨 为什么不能 `Lazy<Mutex<Connection>>` + `panic!`
///
/// 旧实现把 `init_db()` 的失败直接 `panic!` 在 `Lazy` 里，而命令是**第一次访问 DB 时**
/// 才触发初始化的（用户点「统计」页）。配合 `Cargo.toml` 的 `panic = "abort"`
/// 与 release 版的 `windows_subsystem = "windows"`（没有 stderr）：
///
/// > 点统计页 ⇒ 窗口瞬间消失，一个字都看不到 ⇒ 再点还是消失 ⇒ 看起来像「统计页必崩」。
///
/// 触发条件是 `%APPDATA%\FretMaster` 不可写 / 磁盘满 / db 被占用或损坏 —— 都不是罕见事故。
///
/// 现在失败只记录成 `error`，命令返回 `Err(...)`，前端可以提示
/// 「数据库不可用：<路径>（<原因>）」，用户在同一个会话里还能继续用其它功能。
pub struct DbState {
    conn: Option<Mutex<Connection>>,
    /// 初始化失败时的完整说明（含路径与原始错误），供命令层原样上抛。
    error: Option<String>,
}

static DB: Lazy<DbState> = Lazy::new(|| {
    let path = get_db_path();
    match init_db() {
        Ok(conn) => DbState { conn: Some(Mutex::new(conn)), error: None },
        Err(e) => {
            let message = format!(
                "数据库不可用：{}（{}）。常见原因：目录不可写 / 磁盘已满 / 文件被另一个实例占用。",
                path.display(),
                e
            );
            // 只在日志里留一条：此时还没有 UI 可以弹窗，但排查时必须有据可查。
            log::error!("{}", message);
            DbState { conn: None, error: Some(message) }
        }
    }
});

fn get_db_path() -> PathBuf {
    let mut path = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push("FretMaster");
    std::fs::create_dir_all(&path).ok();
    path.push("fretmaster.db");
    path
}

/// 数据库文件路径（诊断/提示用）。
pub fn db_path() -> PathBuf {
    get_db_path()
}

fn init_db() -> SqliteResult<Connection> {
    let db_path = get_db_path();
    let conn = Connection::open(&db_path)?;

    // busy_timeout（审计 2026-10-31 第 10 项）。
    //
    // 事实核对：**rusqlite 0.32 打开连接时已默认设了 5000ms**（`sqlite3_busy_timeout`），
    // 所以这一行不是「修一个不存在的 bug」，而是把依赖的隐式默认变成**显式契约**：
    // 换驱动版本 / 有人抄了别的 open 路径时，不会静默回到 0。
    // 0 的后果：第二个实例（双击两次图标是 Windows 常规操作）打开同一个 db 时
    // SQLite **立即**返回 SQLITE_BUSY ⇒「database is locked」⇒ 前端只 logger.error
    // 就丢掉这条记录（用户看不到提示，本次练习白练）。
    // 护栏：`__tests__` 同层的行为用例断言 `PRAGMA busy_timeout >= 5000`。
    conn.busy_timeout(Duration::from_secs(5))?;

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

/// 取数据库连接。
///
/// 🚨 初始化失败时返回 `Err(说明)`，**绝不 panic**（见 `DbState` 的注释）。
/// 错误类型用 `anyhow::Error` 是为了让 `db::stats` 里的 `?` 能与 `rusqlite::Error`
/// 混用（`anyhow::Error` 能 `From<rusqlite::Error>`，但**不能** `From<String>`）。
pub fn get_db() -> anyhow::Result<MutexGuard<'static, Connection>> {
    match &DB.conn {
        Some(mutex) => Ok(mutex.lock().unwrap_or_else(PoisonError::into_inner)),
        None => Err(anyhow::anyhow!(
            "{}",
            DB.error
                .clone()
                .unwrap_or_else(|| "数据库不可用（未知原因）".to_string())
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 契约：db 路径必须在数据目录下的 `FretMaster/fretmaster.db`。
    /// （数据库文件位置变了 = 老用户的统计"凭空消失"，所以钉住。）
    #[test]
    fn db_path_is_under_fretmaster_dir() {
        let path = db_path();
        assert_eq!(path.file_name().unwrap(), "fretmaster.db");
        assert_eq!(path.parent().unwrap().file_name().unwrap(), "FretMaster");
    }

    /// 🚨 契约：取连接**不许 panic**，失败必须是可上抛的 Err。
    /// 这条用例在正常环境里拿到的是 Ok；它真正挡的是「有人把 get_db 改回 unwrap/panic」。
    #[test]
    fn get_db_returns_result_and_initialises_schema() {
        match get_db() {
            Ok(conn) => {
                // schema 必须齐全（三张表 + busy_timeout 生效说明连接可用）
                for table in ["practice_stats", "practice_sessions", "position_stats"] {
                    let count: i64 = conn
                        .query_row(
                            "SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?1",
                            rusqlite::params![table],
                            |row| row.get(0),
                        )
                        .expect("查询 sqlite_master 失败");
                    assert_eq!(count, 1, "缺少表 {table}");
                }
                // 🚨 busy_timeout 必须真的设上（审计第 10 项）：没有它，第二个实例
                //    打开同一个 db 时 SQLite 会**立即**返回 SQLITE_BUSY，
                //    落库直接丢记录且用户看不到提示。
                let busy: i64 = conn
                    .query_row("PRAGMA busy_timeout", [], |row| row.get(0))
                    .expect("查询 busy_timeout 失败");
                assert!(busy >= 5000, "busy_timeout 太小（{busy}ms），双开会直接丢记录");
            }
            Err(error) => {
                // 环境本身不可写（CI 沙箱）时也不能崩：错误文案必须带路径，便于用户自查
                let message = error.to_string();
                assert!(message.contains("数据库"), "错误文案要能看懂：{message}");
            }
        }
    }
}
