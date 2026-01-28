# 簽到積分系統

內部簽到積分管理系統，支援批量簽到、人員管理、積分排行等功能。

## 功能

- 使用者認證（JWT）
- 人員管理（新增、刪除、搜尋篩選）
- 部門管理
- 事件管理
- 批量簽到
- 積分排行榜
- 刪除簽到記錄（扣回積分）
- 清空所有積分

## 部署到 VPS

### 需求

- Docker
- Docker Compose

### 步驟

```bash
# 1. Clone 專案
git clone https://github.com/你的帳號/sign-files.git
cd sign-files

# 2. 設定環境變數
cp .env.example .env
nano .env  # 編輯填入你的密碼

# 3. 啟動服務
docker-compose up -d

# 4. 查看狀態
docker-compose ps
```

### 環境變數設定

建立 `.env` 檔案（不會被 git 追蹤）：

```env
SECRET_KEY=your-random-secret-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your-secure-password
```

### 服務網址

| 服務 | 網址 |
|------|------|
| 前端 | http://your-server:3000 |
| 後端 API | http://your-server:8000 |
| API 文件 | http://your-server:8000/docs |

## 目錄結構

```
sign-files/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── main.py
│   └── requirements.txt
└── frontend/
    ├── Dockerfile
    ├── index.html
    ├── styles.css
    └── app.js
```

## 常用指令

```bash
# 查看日誌
docker-compose logs -f

# 停止服務
docker-compose down

# 重啟服務
docker-compose restart

# 重新建置並啟動
docker-compose up -d --build
```

## API 端點

### 認證
| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/auth/login` | 登入 |
| GET | `/api/auth/me` | 取得當前使用者 |

### 人員管理
| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/members` | 取得人員列表 |
| POST | `/api/members` | 新增人員 |
| DELETE | `/api/members/{id}` | 刪除人員 |

### 部門管理
| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/teams` | 取得部門列表 |
| POST | `/api/teams` | 新增部門 |

### 事件管理
| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/events` | 取得事件列表 |
| POST | `/api/events` | 新增事件 |
| PUT | `/api/events/{id}` | 更新事件 |
| DELETE | `/api/events/{id}` | 刪除事件 |

### 簽到
| 方法 | 端點 | 說明 |
|------|------|------|
| POST | `/api/checkin/batch` | 批量簽到 |
| GET | `/api/checkin-records` | 取得簽到記錄 |
| DELETE | `/api/checkin-records/{id}` | 刪除簽到記錄 |

### 積分管理
| 方法 | 端點 | 說明 |
|------|------|------|
| GET | `/api/leaderboard` | 積分排行榜 |
| POST | `/api/members/reset-all-points` | 清空所有積分 |
| POST | `/api/system/reset-all` | 清空所有資料 |

## 注意事項

- 目前使用記憶體儲存，重啟後端容器會清空資料
- 生產環境請修改 `SECRET_KEY` 環境變數
