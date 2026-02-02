#!/bin/bash

# ==============================================
# 簽到系統資料庫自動備份腳本
# ==============================================

# 設定
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_FILE="$PROJECT_DIR/data/db.json"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP_DAYS=30  # 保留最近 30 天的備份

# 建立備份目錄
mkdir -p "$BACKUP_DIR"

# 檢查資料檔案是否存在
if [ ! -f "$DATA_FILE" ]; then
    echo "[錯誤] 找不到資料檔案: $DATA_FILE"
    exit 1
fi

# 建立備份檔名（含時間戳）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/db_backup_$TIMESTAMP.json"

# 執行備份
cp "$DATA_FILE" "$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[成功] 備份完成: $BACKUP_FILE"

    # 顯示備份檔案大小
    SIZE=$(ls -lh "$BACKUP_FILE" | awk '{print $5}')
    echo "[資訊] 檔案大小: $SIZE"
else
    echo "[錯誤] 備份失敗"
    exit 1
fi

# 清理過期備份
echo "[清理] 刪除 $KEEP_DAYS 天前的備份..."
find "$BACKUP_DIR" -name "db_backup_*.json" -type f -mtime +$KEEP_DAYS -delete

# 顯示目前備份數量
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/db_backup_*.json 2>/dev/null | wc -l)
echo "[資訊] 目前共有 $BACKUP_COUNT 個備份檔案"

echo "[完成] 備份作業結束"
