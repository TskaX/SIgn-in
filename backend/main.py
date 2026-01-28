"""
簽到積分系統 - Python FastAPI 後端
=====================================
功能：
- 使用者認證（JWT）
- 人員管理（CRUD）
- 團隊管理
- 事件管理
- 簽到與積分計算
- 批量簽到
"""

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
from enum import Enum
import jwt
import hashlib
import uuid
import os
import json

# ============== 配置（從環境變數讀取）==============
SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 小時

app = FastAPI(
    title="簽到積分系統 API",
    description="一個完整的簽到積分管理系統",
    version="1.0.0"
)

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生產環境請設定具體網域
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# ============== 資料模型 ==============

class EventStatus(str, Enum):
    ACTIVE = "active"
    UPCOMING = "upcoming"
    COMPLETED = "completed"

class UserRole(str, Enum):
    ADMIN = "admin"
    USER = "user"

# 請求模型
class LoginRequest(BaseModel):
    username: str
    password: str

class MemberCreate(BaseModel):
    name: str
    team: Optional[str] = None
    email: Optional[str] = None

class MemberUpdate(BaseModel):
    name: Optional[str] = None
    team: Optional[str] = None
    email: Optional[str] = None

class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None

class EventCreate(BaseModel):
    name: str
    points: float
    date: str
    description: Optional[str] = None

class EventUpdate(BaseModel):
    name: Optional[str] = None
    points: Optional[float] = None
    date: Optional[str] = None
    status: Optional[EventStatus] = None
    description: Optional[str] = None

class CheckInRequest(BaseModel):
    event_id: str
    member_ids: List[str]

class BatchCheckInRequest(BaseModel):
    event_id: str
    member_ids: List[str]

# 回應模型
class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

class Member(BaseModel):
    id: str
    name: str
    team: str
    points: float
    email: Optional[str]
    created_at: str

class Team(BaseModel):
    id: str
    name: str
    description: Optional[str]
    member_count: int

class Event(BaseModel):
    id: str
    name: str
    points: float
    date: str
    status: EventStatus
    description: Optional[str]
    created_at: str

class CheckInRecord(BaseModel):
    id: str
    event_id: str
    member_id: str
    points_awarded: float
    checked_in_at: str

# ============== 資料持久化 ==============
DATA_FILE = "/app/data/db.json"

def load_db():
    """從 JSON 檔案載入資料"""
    default_db = {
        "members": {},
        "teams": {},
        "events": {},
        "checkin_records": {}
    }
    try:
        if os.path.exists(DATA_FILE):
            with open(DATA_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 確保所有必要的 key 都存在
                for key in default_db:
                    if key not in data:
                        data[key] = {}
                return data
    except Exception as e:
        print(f"載入資料失敗: {e}")
    return default_db

def save_db():
    """儲存資料到 JSON 檔案"""
    try:
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        with open(DATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"儲存資料失敗: {e}")

# 載入資料
db = load_db()

# 動態產生 users（不儲存到檔案，每次從環境變數讀取）
def get_users():
    return {
        ADMIN_USERNAME: {
            "id": "user-1",
            "username": ADMIN_USERNAME,
            "password_hash": hashlib.sha256(ADMIN_PASSWORD.encode()).hexdigest(),
            "role": UserRole.ADMIN,
            "name": "系統管理員"
        }
    }

# 初始化範例資料
def init_sample_data():
    # 團隊
    teams_data = [
        {"name": "技術部", "description": "負責技術開發"},
        {"name": "行銷部", "description": "負責市場行銷"},
        {"name": "人資部", "description": "負責人力資源"},
        {"name": "財務部", "description": "負責財務管理"},
    ]
    for team in teams_data:
        team_id = f"team-{uuid.uuid4().hex[:8]}"
        db["teams"][team_id] = {
            "id": team_id,
            **team,
            "created_at": datetime.now().isoformat()
        }
    
    team_ids = list(db["teams"].keys())
    
    # 人員
    members_data = [
        {"name": "張小明", "team": "技術部", "points": 150},
        {"name": "李美華", "team": "技術部", "points": 230},
        {"name": "王大偉", "team": "行銷部", "points": 180},
        {"name": "陳思琪", "team": "行銷部", "points": 95},
        {"name": "林志豪", "team": "人資部", "points": 210},
        {"name": "黃雅婷", "team": "人資部", "points": 175},
        {"name": "劉建國", "team": "財務部", "points": 120},
        {"name": "吳佳玲", "team": "財務部", "points": 88},
    ]
    for member in members_data:
        member_id = f"member-{uuid.uuid4().hex[:8]}"
        db["members"][member_id] = {
            "id": member_id,
            "name": member["name"],
            "team": member["team"],
            "points": member["points"],
            "email": f"{member['name']}@example.com",
            "created_at": datetime.now().isoformat()
        }
    
    # 事件
    events_data = [
        {"name": "週會簽到", "points": 10, "date": "2026-01-27", "status": EventStatus.ACTIVE},
        {"name": "培訓課程", "points": 30, "date": "2026-01-28", "status": EventStatus.UPCOMING},
        {"name": "團隊建設", "points": 50, "date": "2026-01-25", "status": EventStatus.COMPLETED},
    ]
    for event in events_data:
        event_id = f"event-{uuid.uuid4().hex[:8]}"
        db["events"][event_id] = {
            "id": event_id,
            "name": event["name"],
            "points": event["points"],
            "date": event["date"],
            "status": event["status"],
            "description": None,
            "created_at": datetime.now().isoformat()
        }

# 如需測試資料，取消下行註解
# init_sample_data()

# ============== 工具函數 ==============

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=15))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(status_code=401, detail="無效的認證憑證")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token 已過期")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="無效的 Token")

def get_current_user(token_data: dict = Depends(verify_token)):
    username = token_data.get("sub")
    user = get_users().get(username)
    if not user:
        raise HTTPException(status_code=404, detail="使用者不存在")
    return user

def require_admin(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="需要管理員權限")
    return current_user

# ============== API 路由 ==============

# ----- 認證 -----
@app.post("/api/auth/login", response_model=Token, tags=["認證"])
async def login(request: LoginRequest):
    """使用者登入"""
    user = get_users().get(request.username)
    if not user:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    
    password_hash = hashlib.sha256(request.password.encode()).hexdigest()
    if user["password_hash"] != password_hash:
        raise HTTPException(status_code=401, detail="帳號或密碼錯誤")
    
    access_token = create_access_token(
        data={"sub": user["username"], "role": user["role"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user["id"],
            "username": user["username"],
            "name": user["name"],
            "role": user["role"]
        }
    }

@app.get("/api/auth/me", tags=["認證"])
async def get_current_user_info(current_user: dict = Depends(get_current_user)):
    """取得當前使用者資訊"""
    return {
        "id": current_user["id"],
        "username": current_user["username"],
        "name": current_user["name"],
        "role": current_user["role"]
    }

# ----- 人員管理 -----
@app.get("/api/members", tags=["人員管理"])
async def get_members(
    team: Optional[str] = None,
    search: Optional[str] = None,
    _: dict = Depends(verify_token)
):
    """取得人員列表"""
    members = list(db["members"].values())
    
    if team:
        members = [m for m in members if m["team"] == team]
    
    if search:
        search_lower = search.lower()
        members = [m for m in members if search_lower in m["name"].lower()]
    
    return {"members": members, "total": len(members)}

@app.get("/api/members/{member_id}", tags=["人員管理"])
async def get_member(member_id: str, _: dict = Depends(verify_token)):
    """取得單一人員"""
    member = db["members"].get(member_id)
    if not member:
        raise HTTPException(status_code=404, detail="人員不存在")
    return member

@app.post("/api/members", tags=["人員管理"])
async def create_member(request: MemberCreate, _: dict = Depends(require_admin)):
    """新增人員"""
    member_id = f"member-{uuid.uuid4().hex[:8]}"
    member = {
        "id": member_id,
        "name": request.name,
        "team": request.team,
        "email": request.email,
        "points": 0,
        "created_at": datetime.now().isoformat()
    }
    db["members"][member_id] = member
    save_db()
    return member

@app.put("/api/members/{member_id}", tags=["人員管理"])
async def update_member(
    member_id: str,
    request: MemberUpdate,
    _: dict = Depends(require_admin)
):
    """更新人員"""
    member = db["members"].get(member_id)
    if not member:
        raise HTTPException(status_code=404, detail="人員不存在")
    
    update_data = request.dict(exclude_unset=True)
    member.update(update_data)
    save_db()
    return member

@app.delete("/api/members/{member_id}", tags=["人員管理"])
async def delete_member(member_id: str, _: dict = Depends(require_admin)):
    """刪除人員"""
    if member_id not in db["members"]:
        raise HTTPException(status_code=404, detail="人員不存在")
    del db["members"][member_id]
    save_db()
    return {"message": "刪除成功"}

# ----- 團隊管理 -----
@app.get("/api/teams", tags=["團隊管理"])
async def get_teams(_: dict = Depends(verify_token)):
    """取得團隊列表"""
    teams = []
    for team in db["teams"].values():
        member_count = len([m for m in db["members"].values() if m["team"] == team["name"]])
        teams.append({**team, "member_count": member_count})
    return {"teams": teams}

@app.post("/api/teams", tags=["團隊管理"])
async def create_team(request: TeamCreate, _: dict = Depends(require_admin)):
    """新增團隊"""
    team_id = f"team-{uuid.uuid4().hex[:8]}"
    team = {
        "id": team_id,
        "name": request.name,
        "description": request.description,
        "created_at": datetime.now().isoformat()
    }
    db["teams"][team_id] = team
    save_db()
    return team

# ----- 事件管理 -----
@app.get("/api/events", tags=["事件管理"])
async def get_events(
    status: Optional[EventStatus] = None,
    _: dict = Depends(verify_token)
):
    """取得事件列表"""
    events = list(db["events"].values())
    
    if status:
        events = [e for e in events if e["status"] == status]
    
    return {"events": events}

@app.get("/api/events/{event_id}", tags=["事件管理"])
async def get_event(event_id: str, _: dict = Depends(verify_token)):
    """取得單一事件"""
    event = db["events"].get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    return event

@app.post("/api/events", tags=["事件管理"])
async def create_event(request: EventCreate, _: dict = Depends(require_admin)):
    """新增事件"""
    event_id = f"event-{uuid.uuid4().hex[:8]}"
    event = {
        "id": event_id,
        "name": request.name,
        "points": request.points,
        "date": request.date,
        "status": EventStatus.ACTIVE,
        "description": request.description,
        "created_at": datetime.now().isoformat()
    }
    db["events"][event_id] = event
    save_db()
    return event

@app.put("/api/events/{event_id}", tags=["事件管理"])
async def update_event(
    event_id: str,
    request: EventUpdate,
    _: dict = Depends(require_admin)
):
    """更新事件"""
    event = db["events"].get(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    
    update_data = request.dict(exclude_unset=True)
    event.update(update_data)
    save_db()
    return event

@app.delete("/api/events/{event_id}", tags=["事件管理"])
async def delete_event(event_id: str, _: dict = Depends(require_admin)):
    """刪除事件"""
    if event_id not in db["events"]:
        raise HTTPException(status_code=404, detail="事件不存在")
    del db["events"][event_id]
    save_db()
    return {"message": "刪除成功"}

# ----- 簽到 -----
@app.post("/api/checkin", tags=["簽到"])
async def single_checkin(request: CheckInRequest, _: dict = Depends(verify_token)):
    """單人簽到"""
    event = db["events"].get(request.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    
    if event["status"] != EventStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="此事件無法簽到")
    
    results = []
    for member_id in request.member_ids:
        member = db["members"].get(member_id)
        if not member:
            continue
        
        # 檢查是否已簽到
        existing = [
            r for r in db["checkin_records"].values()
            if r["event_id"] == request.event_id and r["member_id"] == member_id
        ]
        if existing:
            continue
        
        # 新增積分
        member["points"] += event["points"]
        
        # 記錄簽到
        record_id = f"record-{uuid.uuid4().hex[:8]}"
        record = {
            "id": record_id,
            "event_id": request.event_id,
            "member_id": member_id,
            "points_awarded": event["points"],
            "checked_in_at": datetime.now().isoformat()
        }
        db["checkin_records"][record_id] = record
        results.append(record)

    save_db()
    return {
        "success": True,
        "checked_in_count": len(results),
        "records": results
    }

@app.post("/api/checkin/batch", tags=["簽到"])
async def batch_checkin(request: BatchCheckInRequest, _: dict = Depends(verify_token)):
    """批量簽到"""
    event = db["events"].get(request.event_id)
    if not event:
        raise HTTPException(status_code=404, detail="事件不存在")
    
    if event["status"] != EventStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="此事件無法簽到")
    
    success_count = 0
    failed_count = 0
    results = []
    
    for member_id in request.member_ids:
        member = db["members"].get(member_id)
        if not member:
            failed_count += 1
            continue
        
        # 檢查是否已簽到
        existing = [
            r for r in db["checkin_records"].values()
            if r["event_id"] == request.event_id and r["member_id"] == member_id
        ]
        if existing:
            failed_count += 1
            continue
        
        # 新增積分
        member["points"] += event["points"]
        
        # 記錄簽到
        record_id = f"record-{uuid.uuid4().hex[:8]}"
        record = {
            "id": record_id,
            "event_id": request.event_id,
            "member_id": member_id,
            "member_name": member["name"],
            "points_awarded": event["points"],
            "checked_in_at": datetime.now().isoformat()
        }
        db["checkin_records"][record_id] = record
        results.append(record)
        success_count += 1

    save_db()
    return {
        "success": True,
        "event_name": event["name"],
        "points_per_person": event["points"],
        "success_count": success_count,
        "failed_count": failed_count,
        "total_points_awarded": success_count * event["points"],
        "records": results
    }

# ----- 積分與排行 -----
@app.get("/api/leaderboard", tags=["積分排行"])
async def get_leaderboard(
    team: Optional[str] = None,
    limit: int = 50,
    _: dict = Depends(verify_token)
):
    """取得積分排行榜"""
    members = list(db["members"].values())
    
    if team:
        members = [m for m in members if m["team"] == team]
    
    # 按積分排序
    sorted_members = sorted(members, key=lambda x: x["points"], reverse=True)[:limit]
    
    # 加入排名
    leaderboard = []
    for i, member in enumerate(sorted_members, 1):
        leaderboard.append({
            "rank": i,
            **member
        })
    
    return {"leaderboard": leaderboard}

@app.get("/api/statistics", tags=["統計"])
async def get_statistics(_: dict = Depends(require_admin)):
    """取得系統統計資料"""
    members = list(db["members"].values())
    events = list(db["events"].values())
    records = list(db["checkin_records"].values())
    
    total_points = sum(m["points"] for m in members)
    
    # 團隊統計
    team_stats = {}
    for member in members:
        team = member["team"]
        if team not in team_stats:
            team_stats[team] = {"members": 0, "total_points": 0}
        team_stats[team]["members"] += 1
        team_stats[team]["total_points"] += member["points"]
    
    return {
        "total_members": len(members),
        "total_events": len(events),
        "total_checkins": len(records),
        "total_points_distributed": total_points,
        "active_events": len([e for e in events if e["status"] == EventStatus.ACTIVE]),
        "team_statistics": team_stats
    }

# ----- 簽到記錄 -----
@app.get("/api/checkin-records", tags=["簽到記錄"])
async def get_checkin_records(
    event_id: Optional[str] = None,
    member_id: Optional[str] = None,
    _: dict = Depends(verify_token)
):
    """取得簽到記錄"""
    records = list(db["checkin_records"].values())
    
    if event_id:
        records = [r for r in records if r["event_id"] == event_id]
    
    if member_id:
        records = [r for r in records if r["member_id"] == member_id]
    
    # 加入關聯資料
    enriched_records = []
    for record in records:
        event = db["events"].get(record["event_id"], {})
        member = db["members"].get(record["member_id"], {})
        enriched_records.append({
            **record,
            "event_name": event.get("name"),
            "member_name": member.get("name"),
            "member_team": member.get("team")
        })
    
    return {"records": enriched_records}

@app.delete("/api/checkin-records/{record_id}", tags=["簽到記錄"])
async def delete_checkin_record(record_id: str, _: dict = Depends(require_admin)):
    """刪除簽到記錄並扣回積分"""
    record = db["checkin_records"].get(record_id)
    if not record:
        raise HTTPException(status_code=404, detail="簽到記錄不存在")

    # 扣回積分
    member = db["members"].get(record["member_id"])
    if member:
        member["points"] = max(0, member["points"] - record["points_awarded"])

    # 刪除記錄
    del db["checkin_records"][record_id]
    save_db()

    return {
        "message": "刪除成功",
        "points_deducted": record["points_awarded"],
        "member_id": record["member_id"]
    }

# ----- 積分管理 -----
@app.post("/api/members/reset-all-points", tags=["積分管理"])
async def reset_all_points(_: dict = Depends(require_admin)):
    """清空所有人員積分（重置為 0）"""
    count = 0
    total_points_cleared = 0

    for member in db["members"].values():
        total_points_cleared += member["points"]
        member["points"] = 0
        count += 1

    # 清空所有簽到記錄
    records_cleared = len(db["checkin_records"])
    db["checkin_records"].clear()
    save_db()

    return {
        "message": "已清空所有積分",
        "members_affected": count,
        "total_points_cleared": total_points_cleared,
        "records_cleared": records_cleared
    }

@app.post("/api/system/reset-all", tags=["系統管理"])
async def reset_all_data(_: dict = Depends(require_admin)):
    """清空所有資料（人員、部門、事件、簽到記錄）"""
    members_count = len(db["members"])
    teams_count = len(db["teams"])
    events_count = len(db["events"])
    records_count = len(db["checkin_records"])

    db["members"].clear()
    db["teams"].clear()
    db["events"].clear()
    db["checkin_records"].clear()
    save_db()

    return {
        "message": "已清空所有資料",
        "members_deleted": members_count,
        "teams_deleted": teams_count,
        "events_deleted": events_count,
        "records_deleted": records_count
    }

@app.delete("/api/members/{member_id}/points", tags=["積分管理"])
async def clear_member_points(member_id: str, _: dict = Depends(require_admin)):
    """清空單一人員積分"""
    member = db["members"].get(member_id)
    if not member:
        raise HTTPException(status_code=404, detail="人員不存在")

    points_cleared = member["points"]
    member["points"] = 0

    # 刪除該人員的簽到記錄
    records_to_delete = [
        rid for rid, r in db["checkin_records"].items()
        if r["member_id"] == member_id
    ]
    for rid in records_to_delete:
        del db["checkin_records"][rid]
    save_db()

    return {
        "message": "已清空積分",
        "points_cleared": points_cleared,
        "records_deleted": len(records_to_delete)
    }

# ============== 啟動設定 ==============
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
