# VPS 部署指南（AWS Free Tier）

本文件說明如何將簽到積分系統部署到 AWS EC2。

## 目錄

1. [建立 EC2 實例](#1-建立-ec2-實例)
2. [設定 Security Group](#2-設定-security-group)
3. [連線到 EC2](#3-連線到-ec2)
4. [安裝 Docker](#4-安裝-docker)
5. [部署專案](#5-部署專案)
6. [常用指令](#6-常用指令)
7. [設定網域與 HTTPS（選用）](#7-設定網域與-https選用)

---

## 1. 建立 EC2 實例

### 進入 AWS Console

1. 登入 [AWS Console](https://console.aws.amazon.com)
2. 搜尋「EC2」並點擊進入
3. 點擊橘色按鈕「Launch instance」

### 設定實例

| 項目 | 設定值 |
|------|--------|
| Name | `sign-system` |
| AMI | Amazon Linux 2023（Free tier eligible） |
| Instance type | `t2.micro`（Free tier eligible） |
| Key pair | 建立新的或選擇現有的 |
| Storage | 20 GB（Free Tier 可用到 30GB） |

### Key Pair 設定

如果沒有 Key Pair：
1. 點擊「Create new key pair」
2. 名稱：`sign-system-key`
3. 類型：RSA
4. 格式：`.pem`
5. 點擊「Create」並下載保存

### 啟動實例

點擊「Launch instance」，等待 1-2 分鐘直到狀態變成 **Running**。

---

## 2. 設定 Security Group

### 進入設定頁面

1. EC2 → Instances → 點擊你的實例
2. 下方「Security」分頁
3. 點擊 Security Group 連結（如 `sg-xxxxxxxx`）
4. 點擊「Inbound rules」→「Edit inbound rules」

### 新增規則

點擊「Add rule」新增以下規則：

| Type | Port | Source | 說明 |
|------|------|--------|------|
| SSH | 22 | 0.0.0.0/0 | SSH 連線 |
| HTTP | 80 | 0.0.0.0/0 | 網頁（HTTPS 用） |
| HTTPS | 443 | 0.0.0.0/0 | HTTPS |
| Custom TCP | 3000 | 0.0.0.0/0 | 前端 |
| Custom TCP | 8000 | 0.0.0.0/0 | 後端 API |

點擊「Save rules」儲存。

---

## 3. 連線到 EC2

### 方法一：EC2 Instance Connect（推薦）

1. EC2 → Instances → 勾選你的實例
2. 點擊上方「Connect」按鈕
3. 選擇「EC2 Instance Connect」分頁
4. 點擊「Connect」

### 方法二：SSH 連線

```bash
# 設定金鑰權限
chmod 400 ~/Downloads/sign-system-key.pem

# 連線（將 YOUR_IP 換成實例的 Public IP）
ssh -i ~/Downloads/sign-system-key.pem ec2-user@YOUR_IP
```

---

## 4. 安裝 Docker

連線到 EC2 後，執行以下指令：

```bash
# 更新系統
sudo yum update -y

# 安裝 Docker
sudo yum install -y docker

# 啟動 Docker
sudo systemctl start docker
sudo systemctl enable docker

# 讓目前使用者可以使用 Docker
sudo usermod -aG docker $USER

# 安裝 Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.24.0/docker-compose-linux-x86_64" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# 安裝 Git
sudo yum install -y git

# 安裝 Buildx
mkdir -p ~/.docker/cli-plugins
curl -Lo ~/.docker/cli-plugins/docker-buildx "https://github.com/docker/buildx/releases/download/v0.12.1/buildx-v0.12.1.linux-amd64"
chmod +x ~/.docker/cli-plugins/docker-buildx

# 重新連線讓權限生效
exit
```

重新連線後確認安裝：

```bash
docker --version
docker-compose --version
```

---

## 5. 部署專案

### Clone 專案

**公開專案：**
```bash
git clone https://github.com/你的帳號/sign-files.git
cd sign-files
```

**私有專案：**
1. 到 https://github.com/settings/tokens 建立 Personal Access Token
   - 點擊「Generate new token (classic)」
   - 勾選 `repo` 權限
   - 複製 Token

2. Clone 時輸入帳號和 Token：
```bash
git clone https://github.com/你的帳號/sign-files.git
# Username: 你的 GitHub 帳號
# Password: 貼上 Token（不是 GitHub 密碼）
cd sign-files
```

### 設定環境變數

```bash
# 建立 .env 檔案
cat > .env << 'EOF'
SECRET_KEY=請改成一串隨機亂碼
ADMIN_USERNAME=admin
ADMIN_PASSWORD=請改成你的安全密碼
EOF

# 或使用 nano 編輯
nano .env
```

### 建立資料目錄

```bash
mkdir -p data
```

### 啟動服務

```bash
docker-compose up -d --build
```

### 確認運行

```bash
docker-compose ps
```

應該看到兩個容器都是 `Up` 狀態。

### 完成！

打開瀏覽器訪問：
- **前端**：`http://你的EC2-IP:3000`
- **API 文件**：`http://你的EC2-IP:8000/docs`

---

## 6. 常用指令

### 查看狀態
```bash
docker-compose ps
```

### 查看日誌
```bash
# 所有服務
docker-compose logs -f

# 只看後端
docker-compose logs -f backend

# 只看前端
docker-compose logs -f frontend
```

### 重啟服務
```bash
docker-compose restart
```

### 停止服務
```bash
docker-compose down
```

### 更新程式碼
```bash
cd sign-files
git pull
docker-compose down
docker-compose up -d --build
```

### 修改環境變數
```bash
nano .env
docker-compose down
docker-compose up -d
```

### 備份資料
```bash
cp data/db.json data/db.json.backup
```

### 還原資料
```bash
cp data/db.json.backup data/db.json
docker-compose restart backend
```

---

## 7. 設定網域與 HTTPS（選用）

### 取得網域

- 免費：[DuckDNS](https://duckdns.org)（如 `yourname.duckdns.org`）
- 付費：[Namecheap](https://namecheap.com)、[Cloudflare](https://cloudflare.com)

### DNS 設定

在網域商的 DNS 設定中新增 A 記錄：

| Type | Name | Value |
|------|------|-------|
| A | @ | 你的 EC2 IP |
| A | www | 你的 EC2 IP |

### 使用 Caddy 設定 HTTPS

1. 建立 Caddyfile：

```bash
cat > Caddyfile << 'EOF'
你的網域.com {
    handle /api/* {
        reverse_proxy localhost:8000
    }
    handle {
        reverse_proxy localhost:3000
    }
}
EOF
```

2. 修改 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    container_name: checkin-backend
    ports:
      - "8000:8000"
    environment:
      - SECRET_KEY=${SECRET_KEY}
      - ADMIN_USERNAME=${ADMIN_USERNAME}
      - ADMIN_PASSWORD=${ADMIN_PASSWORD}
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  frontend:
    build: ./frontend
    container_name: checkin-frontend
    ports:
      - "3000:80"
    depends_on:
      - backend
    restart: unless-stopped

  caddy:
    image: caddy:2
    container_name: checkin-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
      - frontend
    restart: unless-stopped

volumes:
  caddy_data:
  caddy_config:
```

3. 重啟服務：

```bash
docker-compose down
docker-compose up -d
```

4. 訪問 `https://你的網域.com` 即可！

---

## 注意事項

- **Free Tier 限制**：每月 750 小時免費（一台 t2.micro 24 小時運行剛好用完）
- **資料備份**：建議定期備份 `data/db.json`
- **安全性**：
  - 請使用強密碼
  - 建議將 Security Group 的來源 IP 限制在需要的範圍
  - 生產環境建議設定 HTTPS
