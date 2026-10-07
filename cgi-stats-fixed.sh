#!/bin/sh
# SQLite 版本的数据统计 API
# 支持多设备共享练习记录
#
# 安全说明（本次加固）：
#  1. 数据库默认移出 Web 根目录（原 /www/fretmaster/data 可被直接下载，泄露全部记录与客户端 IP）
#  2. 写入加 flock 排他锁 + PRAGMA busy_timeout，避免多设备并发写触发 SQLITE_BUSY 及静默丢数据
#  3. 不再使用 sqlite3 shell 的 `.param set`——它会以 %s 把值原样拼进 SQL 当作【表达式】求值，
#     形如 "(SELECT ...)" 的载荷会被执行。改为手动转义单引号后构造字符串字面量。
#  4. 支持可选 API Token 鉴权（设置 FM_API_TOKEN 环境变量后生效）
#  5. CORS 改为可配置（FM_ALLOWED_ORIGIN），不再无脑返回 *
#  6. score 校验收敛到 0-100；错误返回 5xx 而非 200+error（避免客户端误判成功）
#
# 可通过环境变量覆盖：
#  FM_DB_FILE        数据库路径（默认 /var/lib/fretmaster/practice.db）
#  FM_ALLOWED_ORIGIN 允许的跨域来源（默认不发送 CORS 头；设为具体域名比 * 安全）
#  FM_API_TOKEN      非空时，要求请求携带 X-Api-Token 头或 token 查询参数

DB_FILE="${FM_DB_FILE:-/var/lib/fretmaster/practice.db}"
DATA_DIR=$(dirname "$DB_FILE")
LOCK_FILE="${DB_FILE}.lock"
ALLOWED_ORIGIN="${FM_ALLOWED_ORIGIN:-}"
API_TOKEN="${FM_API_TOKEN:-}"

# 确保数据目录存在
mkdir -p "$DATA_DIR" 2>/dev/null || true

# 初始化数据库（如果不存在）
init_database() {
    if [ ! -f "$DB_FILE" ]; then
        sqlite3 "$DB_FILE" << 'EOF'
CREATE TABLE IF NOT EXISTS practice_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    exercise_type TEXT NOT NULL,
    score INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    accuracy REAL,
    notes TEXT,
    client_ip TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device ON practice_records(device_id);
CREATE INDEX IF NOT EXISTS idx_date ON practice_records(created_at);
CREATE INDEX IF NOT EXISTS idx_ip ON practice_records(client_ip);
EOF
    else
        # 已存在的表添加 client_ip 列（幂等操作，列已存在时忽略错误）
        sqlite3 "$DB_FILE" "ALTER TABLE practice_records ADD COLUMN client_ip TEXT;" 2>/dev/null || true
        sqlite3 "$DB_FILE" "CREATE INDEX IF NOT EXISTS idx_ip ON practice_records(client_ip);" 2>/dev/null || true
    fi
}

# 在排他锁下执行 sqlite3（busy_timeout 应对同一锁之外的并发）
with_db_lock() {
    if command -v flock >/dev/null 2>&1; then
        (
            flock -x 200
            sqlite3 -cmd ".timeout 5000" "$DB_FILE"
        ) 200>"$LOCK_FILE"
    else
        sqlite3 -cmd ".timeout 5000" "$DB_FILE"
    fi
}

# SQL 字符串字面量转义：仅需把单引号翻倍
sql_escape() {
    printf '%s' "$1" | sed "s/'/''/g"
}

# 初始化数据库
init_database

# ==================== 安全函数 ====================

# 清理字符串输入：移除控制字符，限制长度。
# 注意：不要删除 0x80-0xFF 范围的字节，否则会破坏 UTF-8 中文字符。
# 单引号转义由 sql_escape 在构造 SQL 时完成，这里不提前处理，避免二次转义。
sanitize_string() {
    local input="$1"
    local max_length="${2:-255}"

    input=$(printf '%s' "$input" | tr -d '\000-\037' | tr -d '\177' 2>/dev/null || printf '%s' "$input")

    # 限制长度（按字符数）
    if [ ${#input} -gt $max_length ]; then
        input=$(printf '%s' "$input" | cut -c1-$max_length)
    fi

    printf '%s' "$input"
}

# 验证并清理数字输入（含正负号处理：负数不会被静默转成正数）
sanitize_integer() {
    local input="$1"
    local default="${2:-0}"
    local min="${3:-0}"
    local max="${4:-999999}"

    # 只保留数字（去掉多余符号/字符）。负号先记录下来。
    local neg=""
    case "$input" in
        -*|-*) neg="-" ;;
    esac
    input=$(printf '%s' "$input" | grep -o '[0-9][0-9]*' | head -1)

    if [ -z "$input" ]; then
        printf '%s' "$default"
        return
    fi
    [ -n "$neg" ] && input="-$input"

    if [ "$input" -lt "$min" ] 2>/dev/null; then
        printf '%s' "$min"
    elif [ "$input" -gt "$max" ] 2>/dev/null; then
        printf '%s' "$max"
    else
        printf '%s' "$input"
    fi
}

# 验证并清理浮点数输入（范围 0-100）
sanitize_float() {
    local input="$1"
    local default="${2:-NULL}"

    input=$(printf '%s' "$input" | grep -o '[0-9][0-9]*\.[0-9][0-9]*\|[0-9][0-9]*' | head -1)

    if [ -z "$input" ]; then
        printf '%s' "$default"
        return
    fi

    if [ "$(echo "$input < 0" | bc 2>/dev/null || echo 0)" = "1" ]; then
        echo "0"
    elif [ "$(echo "$input > 100" | bc 2>/dev/null || echo 0)" = "1" ]; then
        echo "100"
    else
        echo "$input"
    fi
}

# 验证设备ID格式（只允许字母、数字、下划线、横线）
validate_device_id() {
    local input="$1"

    input=$(printf '%s' "$input" | grep -o '[a-zA-Z0-9_-]*' | head -1)

    if [ ${#input} -gt 64 ]; then
        input=$(printf '%s' "$input" | cut -c1-64)
    fi

    printf '%s' "$input"
}

# 验证练习类型（白名单验证）
validate_exercise_type() {
    local input="$1"
    local allowed_types="pitch_finding interval scale chord_exercise chord_progression 练习 音程 音阶 和弦 找音 找音练习 音程练习 音阶练习 和弦练习 和弦进行"

    for type in $allowed_types; do
        if [ "$input" = "$type" ]; then
            printf '%s' "$input"
            return
        fi
    done

    printf '%s' "练习"
}

# URL 解码
url_decode() {
    local input="$1"
    input=$(printf '%s' "$input" | sed 's/+/ /g')
    input=$(printf '%s' "$input" | sed 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')
    printf "%b" "$input" 2>/dev/null || printf '%s' "$input"
}

# 校验 API Token（仅当配置了 FM_API_TOKEN 时启用）
check_auth() {
    [ -z "$API_TOKEN" ] && return 0
    local provided="$HTTP_X_API_TOKEN"
    if [ -z "$provided" ]; then
        provided=$(printf '%s' "${QUERY_STRING:-}" | grep -o 'token=[^&]*' | cut -d= -f2)
    fi
    [ "$provided" = "$API_TOKEN" ]
}

# ==================== 主逻辑 ====================

# 设置响应头
echo "Content-type: application/json; charset=utf-8"
if [ -n "$ALLOWED_ORIGIN" ]; then
    echo "Access-Control-Allow-Origin: $ALLOWED_ORIGIN"
    echo "Vary: Origin"
else
    # 未配置时按同源处理，不发送通配 CORS 头（避免任意站点跨域读写）
    echo "Access-Control-Allow-Origin: ${HTTP_ORIGIN:-null}"
fi
echo "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS"
echo "Access-Control-Allow-Headers: Content-Type, X-Api-Token"
echo ""

# 处理 OPTIONS 请求（预检）
if [ "$REQUEST_METHOD" = "OPTIONS" ]; then
    exit 0
fi

# 鉴权（OPTIONS 之外的所有方法）
if ! check_auth; then
    echo "Status: 401 Unauthorized"
    echo ""
    echo '{"status":"error","message":"unauthorized"}'
    exit 0
fi

# 处理 POST 请求 - 保存数据
if [ "$REQUEST_METHOD" = "POST" ]; then
    POST_DATA=$(cat)

    RAW_DEVICE_ID=$(printf '%s' "$POST_DATA" | grep -o '"device_id"[^,}]*' | cut -d'"' -f4)
    RAW_EXERCISE_TYPE=$(printf '%s' "$POST_DATA" | grep -o '"exercise_type"[^,}]*' | cut -d'"' -f4)
    RAW_SCORE=$(printf '%s' "$POST_DATA" | grep -o '"score"[^,}]*' | grep -o '[0-9]*')
    RAW_DURATION=$(printf '%s' "$POST_DATA" | grep -o '"duration"[^,}]*' | grep -o '[0-9]*')
    RAW_ACCURACY=$(printf '%s' "$POST_DATA" | grep -o '"accuracy"[^,}]*' | grep -o '[0-9.]*' | head -1)
    RAW_NOTES=$(printf '%s' "$POST_DATA" | grep -o '"notes"[^,}]*' | cut -d'"' -f4)

    DEVICE_ID=$(validate_device_id "$RAW_DEVICE_ID")
    EXERCISE_TYPE=$(validate_exercise_type "$RAW_EXERCISE_TYPE")
    # score/accuracy 均为 0-100 的百分比，收敛校验范围
    SCORE=$(sanitize_integer "$RAW_SCORE" 0 0 100)
    DURATION=$(sanitize_integer "$RAW_DURATION" 0 0 86400)
    ACCURACY=$(sanitize_float "$RAW_ACCURACY" "NULL")
    NOTES=$(sanitize_string "$RAW_NOTES" 500)

    # 记录客户端 IP（支持 X-Forwarded-For，取第一个）
    CLIENT_IP="${REMOTE_ADDR:-unknown}"
    if [ -n "$HTTP_X_FORWARDED_FOR" ]; then
        CLIENT_IP=$(printf '%s' "$HTTP_X_FORWARDED_FOR" | cut -d',' -f1 | tr -d ' ')
    fi
    CLIENT_IP=$(printf '%s' "$CLIENT_IP" | grep -o '[0-9a-fA-F.:]*' | head -1 | cut -c1-45)
    [ -z "$CLIENT_IP" ] && CLIENT_IP="unknown"

    if [ -z "$DEVICE_ID" ] || [ -z "$EXERCISE_TYPE" ]; then
        echo "Status: 400 Bad Request"
        echo ""
        echo '{"status":"error","message":"缺少必要字段: device_id, exercise_type"}'
        exit 0
    fi

    ESC_DEVICE_ID=$(sql_escape "$DEVICE_ID")
    ESC_EXERCISE_TYPE=$(sql_escape "$EXERCISE_TYPE")
    ESC_NOTES=$(sql_escape "$NOTES")
    ESC_CLIENT_IP=$(sql_escape "$CLIENT_IP")

    # 使用字符串字面量构造 SQL（单引号已转义），不依赖 .param set 的表达式求值行为
    if [ "$ACCURACY" = "NULL" ]; then
        RESULT=$(with_db_lock << EOF
INSERT INTO practice_records (device_id, exercise_type, score, duration, notes, client_ip)
VALUES ('$ESC_DEVICE_ID', '$ESC_EXERCISE_TYPE', $SCORE, $DURATION, '$ESC_NOTES', '$ESC_CLIENT_IP');
SELECT last_insert_rowid();
EOF
)
    else
        RESULT=$(with_db_lock << EOF
INSERT INTO practice_records (device_id, exercise_type, score, duration, accuracy, notes, client_ip)
VALUES ('$ESC_DEVICE_ID', '$ESC_EXERCISE_TYPE', $SCORE, $DURATION, $ACCURACY, '$ESC_NOTES', '$ESC_CLIENT_IP');
SELECT last_insert_rowid();
EOF
)
    fi

    RESULT_ID=$(printf '%s' "$RESULT" | grep -o '[0-9]\+$' | tail -1)

    if [ -n "$RESULT_ID" ] && [ "$RESULT_ID" -gt 0 ] 2>/dev/null; then
        echo "{\"status\":\"ok\",\"message\":\"数据已保存\",\"id\":$RESULT_ID}"
    else
        echo "Status: 500 Internal Server Error"
        echo ""
        echo '{"status":"error","message":"数据库操作失败"}'
    fi
    exit 0
fi

# 处理 GET 请求 - 读取数据
if [ "$REQUEST_METHOD" = "GET" ]; then
    QUERY_STRING="${QUERY_STRING:-}"

    DEVICE_FILTER=""
    if printf '%s' "$QUERY_STRING" | grep -q 'device_id='; then
        RAW_DEVICE_ID=$(printf '%s' "$QUERY_STRING" | sed 's/.*device_id=\([^&]*\).*/\1/')
        RAW_DEVICE_ID=$(url_decode "$RAW_DEVICE_ID")
        DEVICE_ID=$(validate_device_id "$RAW_DEVICE_ID")

        if [ -n "$DEVICE_ID" ]; then
            ESC_DEVICE_ID=$(sql_escape "$DEVICE_ID")
            DEVICE_FILTER="WHERE device_id = '$ESC_DEVICE_ID'"
        fi
    fi

    RAW_LIMIT=$(printf '%s' "$QUERY_STRING" | grep -o 'limit=[0-9]*' | cut -d= -f2)
    LIMIT=$(sanitize_integer "$RAW_LIMIT" 100 1 1000)

    printf '['
    with_db_lock << EOF | awk 'BEGIN{first=1} {if(first){first=0}else{printf ","} printf "%s", $0}'
SELECT json_object('id', id, 'device_id', device_id, 'exercise_type', exercise_type, 'score', score, 'duration', duration, 'accuracy', accuracy, 'notes', notes, 'created_at', created_at)
FROM practice_records
$DEVICE_FILTER
ORDER BY created_at DESC
LIMIT $LIMIT;
EOF
    printf ']'
    exit 0
fi

# 处理 DELETE 请求 - 删除数据
if [ "$REQUEST_METHOD" = "DELETE" ]; then
    DELETE_DATA=$(cat)
    RAW_RECORD_ID=$(printf '%s' "$DELETE_DATA" | grep -o '"id"[^,}]*' | grep -o '[0-9]*')
    RECORD_ID=$(sanitize_integer "$RAW_RECORD_ID" "" 1 999999999)

    if [ -n "$RECORD_ID" ] && [ "$RECORD_ID" -gt 0 ]; then
        DELETED=$(with_db_lock << EOF
DELETE FROM practice_records WHERE id = $RECORD_ID;
SELECT changes();
EOF
)

        if [ "$DELETED" -gt 0 ] 2>/dev/null; then
            echo '{"status":"ok","message":"记录已删除"}'
        else
            echo '{"status":"error","message":"记录不存在或已删除"}'
        fi
    else
        echo "Status: 400 Bad Request"
        echo ""
        echo '{"status":"error","message":"无效的记录ID"}'
    fi
    exit 0
fi

# 其他方法
echo "Status: 405 Method Not Allowed"
echo ""
echo '{"status":"error","message":"不支持的请求方法"}'
