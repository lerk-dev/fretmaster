#!/bin/sh
# SQLite 版本的数据统计 API
# 支持多设备共享练习记录
# 已修复 SQL 注入漏洞
# 已修复 sanitize_string 中文剥离 bug（不再删除 0x80-0xFF 字节）

DB_FILE="/www/fretmaster/data/practice.db"
DATA_DIR="/www/fretmaster/data"

# 确保数据目录存在
mkdir -p "$DATA_DIR"

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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_device ON practice_records(device_id);
CREATE INDEX IF NOT EXISTS idx_date ON practice_records(created_at);
EOF
    fi
}

# 初始化数据库
init_database

# ==================== 安全函数 ====================

# SQL 注入防护：清理字符串输入
# 转义单引号，移除危险字符，限制长度
sanitize_string() {
    local input="$1"
    local max_length="${2:-255}"

    # 只移除控制字符 (0x00-0x1F) 和 DEL (0x7F)
    # 注意：不要删除 0x80-0xFF 范围的字节，否则会破坏 UTF-8 中文字符
    # （原代码 tr -d '\177-\377' 会把所有中文字符剥离成只剩冒号）
    # POST 分支已使用 sqlite3 .param set 参数化查询，SQL 注入风险已通过参数化缓解
    input=$(echo "$input" | tr -d '\000-\037' | tr -d '\177' 2>/dev/null || echo "$input")

    # 转义单引号（SQL 标准）
    input=$(echo "$input" | sed "s/'/''/g" 2>/dev/null || echo "$input")

    # 移除可能的 SQL 注入模式
    input=$(echo "$input" | sed 's/;--//g' | sed 's/--//g' | sed 's/\/\*//g' | sed 's/\*\///g' 2>/dev/null || echo "$input")

    # 限制长度
    if [ ${#input} -gt $max_length ]; then
        input="${input:0:$max_length}"
    fi

    echo "$input"
}

# 验证并清理数字输入
sanitize_integer() {
    local input="$1"
    local default="${2:-0}"
    local min="${3:-0}"
    local max="${4:-999999}"

    # 只保留数字
    input=$(echo "$input" | grep -o '[0-9]*' | head -1)

    # 设置默认值
    if [ -z "$input" ]; then
        echo "$default"
        return
    fi

    # 确保在有效范围内
    if [ "$input" -lt "$min" ] 2>/dev/null; then
        echo "$min"
    elif [ "$input" -gt "$max" ] 2>/dev/null; then
        echo "$max"
    else
        echo "$input"
    fi
}

# 验证并清理浮点数输入
sanitize_float() {
    local input="$1"
    local default="${2:-0}"

    # 只保留数字和小数点
    input=$(echo "$input" | grep -o '[0-9]*\.[0-9]*\|[0-9]*' | head -1)

    if [ -z "$input" ]; then
        echo "$default"
        return
    fi

    # 验证范围 (0-100)
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

    # 只保留安全字符
    input=$(echo "$input" | grep -o '[a-zA-Z0-9_-]*' | head -1)

    # 限制长度
    if [ ${#input} -gt 64 ]; then
        input="${input:0:64}"
    fi

    echo "$input"
}

# 验证练习类型（白名单验证）
validate_exercise_type() {
    local input="$1"

    # 定义允许的练习类型
    local allowed_types="pitch_finding interval scale chord_exercise chord_progression 练习 音程 音阶 和弦 找音"

    # 检查是否在白名单中
    for type in $allowed_types; do
        if [ "$input" = "$type" ]; then
            echo "$input"
            return
        fi
    done

    # 如果不在白名单，返回默认值
    echo "练习"
}

# URL 解码
url_decode() {
    local input="$1"
    input=$(echo "$input" | sed 's/+/ /g')
    input=$(echo "$input" | sed 's/%\([0-9A-Fa-f][0-9A-Fa-f]\)/\\x\1/g')
    printf "%b" "$input" 2>/dev/null || echo "$input"
}

# ==================== 主逻辑 ====================

# 设置响应头
echo "Content-type: application/json; charset=utf-8"
echo "Access-Control-Allow-Origin: *"
echo "Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS"
echo "Access-Control-Allow-Headers: Content-Type"
echo ""

# 处理 OPTIONS 请求（预检）
if [ "$REQUEST_METHOD" = "OPTIONS" ]; then
    exit 0
fi

# 处理 POST 请求 - 保存数据
if [ "$REQUEST_METHOD" = "POST" ]; then
    # 读取 POST 数据
    POST_DATA=$(cat)

    # 解析 JSON 数据（使用简单的字符串提取）
    RAW_DEVICE_ID=$(echo "$POST_DATA" | grep -o '"device_id"[^,}]*' | cut -d'"' -f4)
    RAW_EXERCISE_TYPE=$(echo "$POST_DATA" | grep -o '"exercise_type"[^,}]*' | cut -d'"' -f4)
    RAW_SCORE=$(echo "$POST_DATA" | grep -o '"score"[^,}]*' | grep -o '[0-9]*')
    RAW_DURATION=$(echo "$POST_DATA" | grep -o '"duration"[^,}]*' | grep -o '[0-9]*')
    RAW_ACCURACY=$(echo "$POST_DATA" | grep -o '"accuracy"[^,}]*' | grep -o '[0-9.]*' | head -1)
    RAW_NOTES=$(echo "$POST_DATA" | grep -o '"notes"[^,}]*' | cut -d'"' -f4)

    # 清理和验证输入
    DEVICE_ID=$(validate_device_id "$RAW_DEVICE_ID")
    EXERCISE_TYPE=$(validate_exercise_type "$RAW_EXERCISE_TYPE")
    SCORE=$(sanitize_integer "$RAW_SCORE" 0 0 10000)
    DURATION=$(sanitize_integer "$RAW_DURATION" 0 0 86400)
    ACCURACY=$(sanitize_float "$RAW_ACCURACY" "NULL")
    NOTES=$(sanitize_string "$RAW_NOTES" 500)

    # 验证必要字段
    if [ -z "$DEVICE_ID" ] || [ -z "$EXERCISE_TYPE" ]; then
        echo '{"status":"error","message":"缺少必要字段: device_id, exercise_type"}'
        exit 0
    fi

    # 使用参数化方式插入数据（更安全）
    # 通过管道传递参数，避免直接拼接
    if [ "$ACCURACY" = "NULL" ]; then
        RESULT=$(sqlite3 "$DB_FILE" << EOF
.param set :device_id '$DEVICE_ID'
.param set :exercise_type '$EXERCISE_TYPE'
.param set :score $SCORE
.param set :duration $DURATION
.param set :notes '$NOTES'
INSERT INTO practice_records (device_id, exercise_type, score, duration, notes) VALUES (:device_id, :exercise_type, :score, :duration, :notes);
SELECT last_insert_rowid();
EOF
)
    else
        RESULT=$(sqlite3 "$DB_FILE" << EOF
.param set :device_id '$DEVICE_ID'
.param set :exercise_type '$EXERCISE_TYPE'
.param set :score $SCORE
.param set :duration $DURATION
.param set :accuracy $ACCURACY
.param set :notes '$NOTES'
INSERT INTO practice_records (device_id, exercise_type, score, duration, accuracy, notes) VALUES (:device_id, :exercise_type, :score, :duration, :accuracy, :notes);
SELECT last_insert_rowid();
EOF
)
    fi

    # 提取结果ID
    RESULT_ID=$(echo "$RESULT" | grep -o '[0-9]\+$' | tail -1)

    # 检查是否成功
    if [ -n "$RESULT_ID" ] && [ "$RESULT_ID" -gt 0 ] 2>/dev/null; then
        echo "{\"status\":\"ok\",\"message\":\"数据已保存\",\"id\":$RESULT_ID}"
    else
        # 不暴露详细错误信息
        echo '{"status":"error","message":"数据库操作失败"}'
    fi
    exit 0
fi

# 处理 GET 请求 - 读取数据
if [ "$REQUEST_METHOD" = "GET" ]; then
    # 获取查询参数
    QUERY_STRING="${QUERY_STRING:-}"

    # 解析 device_id 参数（如果有）
    DEVICE_FILTER=""
    if echo "$QUERY_STRING" | grep -q 'device_id='; then
        RAW_DEVICE_ID=$(echo "$QUERY_STRING" | sed 's/.*device_id=\([^&]*\).*/\1/')
        RAW_DEVICE_ID=$(url_decode "$RAW_DEVICE_ID")
        DEVICE_ID=$(validate_device_id "$RAW_DEVICE_ID")

        if [ -n "$DEVICE_ID" ]; then
            DEVICE_FILTER="WHERE device_id = '$DEVICE_ID'"
        fi
    fi

    # 获取最近 N 条记录（默认 100 条，最大 1000 条）
    RAW_LIMIT=$(echo "$QUERY_STRING" | grep -o 'limit=[0-9]*' | cut -d= -f2)
    LIMIT=$(sanitize_integer "$RAW_LIMIT" 100 1 1000)

    # 查询数据（使用参数化查询）
    echo '['
    sqlite3 "$DB_FILE" << EOF | awk 'BEGIN{first=1} {if(first){first=0}else{print ","} printf "%s", $0}'
.param set :limit $LIMIT
SELECT json_object('id', id, 'device_id', device_id, 'exercise_type', exercise_type, 'score', score, 'duration', duration, 'accuracy', accuracy, 'notes', notes, 'created_at', created_at)
FROM practice_records
$DEVICE_FILTER
ORDER BY created_at DESC
LIMIT :limit;
EOF
    echo ''
    echo ']'
    exit 0
fi

# 处理 DELETE 请求 - 删除数据
if [ "$REQUEST_METHOD" = "DELETE" ]; then
    # 读取 DELETE 数据
    DELETE_DATA=$(cat)
    RAW_RECORD_ID=$(echo "$DELETE_DATA" | grep -o '"id"[^,}]*' | grep -o '[0-9]*')

    # 验证并清理 ID
    RECORD_ID=$(sanitize_integer "$RAW_RECORD_ID" "" 1 999999999)

    if [ -n "$RECORD_ID" ] && [ "$RECORD_ID" -gt 0 ]; then
        # 使用参数化查询
        DELETED=$(sqlite3 "$DB_FILE" << EOF
.param set :id $RECORD_ID
DELETE FROM practice_records WHERE id = :id;
SELECT changes();
EOF
)

        if [ "$DELETED" -gt 0 ] 2>/dev/null; then
            echo '{"status":"ok","message":"记录已删除"}'
        else
            echo '{"status":"error","message":"记录不存在或已删除"}'
        fi
    else
        echo '{"status":"error","message":"无效的记录ID"}'
    fi
    exit 0
fi

# 其他方法
echo '{"status":"error","message":"不支持的请求方法"}'
