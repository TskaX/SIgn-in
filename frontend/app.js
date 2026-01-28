// API Configuration
const API_URL = window.location.hostname === 'localhost'
  ? 'http://localhost:8000'
  : `${window.location.protocol}//${window.location.hostname}:8000`;

// State
const state = {
  isLoggedIn: false,
  token: null,
  user: null,
  activeTab: 'checkin',
  teams: [],
  members: [],
  events: [],
  checkInRecords: [],
  selectedMembers: new Set(),
  selectedEvent: null,
  searchQuery: '',
  teamFilter: '全部',
  expandedMember: null,
  expandedLeaderboard: null,
  isComposing: false
};

// DOM Helper
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

// API Functions
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) {
    headers['Authorization'] = `Bearer ${state.token}`;
  }

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: { ...headers, ...options.headers }
    });

    // 401 表示 token 無效，自動登出
    if (res.status === 401 && state.isLoggedIn) {
      logout();
      alert('登入已過期，請重新登入');
      throw new Error('登入已過期');
    }

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'API Error');
    }

    return await res.json();
  } catch (err) {
    console.error('API Error:', err);
    throw err;
  }
}

// Auth Functions
async function login(username, password) {
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });

    state.token = data.access_token;
    state.user = data.user;
    state.isLoggedIn = true;

    // 儲存到 localStorage
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('user', JSON.stringify(data.user));

    await loadData();
    render();
  } catch (err) {
    return err.message;
  }
  return null;
}

function logout() {
  state.token = null;
  state.user = null;
  state.isLoggedIn = false;

  // 清除搜尋狀態
  state.searchQuery = '';
  state.teamFilter = '全部';
  state.selectedMembers.clear();
  state.selectedEvent = null;

  // 清除 localStorage
  localStorage.removeItem('token');
  localStorage.removeItem('user');

  render();
}

// 從 localStorage 恢復登入狀態
function restoreSession() {
  const token = localStorage.getItem('token');
  const user = localStorage.getItem('user');

  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    state.isLoggedIn = true;
    return true;
  }
  return false;
}

// Data Loading
async function loadData() {
  try {
    const [membersRes, teamsRes, eventsRes] = await Promise.all([
      api('/api/members'),
      api('/api/teams'),
      api('/api/events')
    ]);

    state.members = membersRes.members || [];
    state.teams = teamsRes.teams || [];
    state.events = eventsRes.events || [];

    // Load check-in records
    const recordsRes = await api('/api/checkin-records');
    state.checkInRecords = recordsRes.records || [];
  } catch (err) {
    console.error('Failed to load data:', err);
  }
}

// Actions
async function handleCheckIn() {
  if (!state.selectedEvent || state.selectedMembers.size === 0) return;

  try {
    const result = await api('/api/checkin/batch', {
      method: 'POST',
      body: JSON.stringify({
        event_id: state.selectedEvent,
        member_ids: Array.from(state.selectedMembers)
      })
    });

    showToast(`簽到成功！已為 ${result.success_count} 人完成簽到`);
    state.selectedMembers.clear();
    await loadData();
    render();
  } catch (err) {
    alert('簽到失敗：' + err.message);
  }
}

async function addMember(name, team) {
  try {
    await api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name, team })
    });
    await loadData();
    render();
  } catch (err) {
    alert('新增失敗：' + err.message);
  }
}

async function deleteMember(id) {
  if (!confirm('確定要刪除這位成員嗎？')) return;
  try {
    await api(`/api/members/${id}`, { method: 'DELETE' });
    await loadData();
    render();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
}

async function updateMember(id, data) {
  try {
    await api(`/api/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    await loadData();
    render();
    showToast('人員資料已更新');
  } catch (err) {
    alert('更新失敗：' + err.message);
  }
}

async function addTeam(name, description) {
  try {
    await api('/api/teams', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    });
    await loadData();
    render();
  } catch (err) {
    alert('新增失敗：' + err.message);
  }
}

async function addEvent(name, points, date) {
  try {
    await api('/api/events', {
      method: 'POST',
      body: JSON.stringify({ name, points: parseFloat(points), date })
    });
    await loadData();
    render();
  } catch (err) {
    alert('新增失敗：' + err.message);
  }
}

async function deleteEvent(id) {
  if (!confirm('確定要刪除這個事件嗎？')) return;
  try {
    await api(`/api/events/${id}`, { method: 'DELETE' });
    await loadData();
    render();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
}

async function updateEventStatus(id, status) {
  try {
    await api(`/api/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    await loadData();
    render();
  } catch (err) {
    alert('更新失敗：' + err.message);
  }
}

async function resetAllPoints() {
  if (!confirm('確定要清空所有人員的積分嗎？\n\n此操作將：\n- 將所有人員積分歸零\n- 刪除所有簽到記錄\n\n此操作無法復原！')) return;
  if (!confirm('再次確認：真的要清空所有積分嗎？')) return;

  try {
    const result = await api('/api/members/reset-all-points', { method: 'POST' });
    showToast(`已清空 ${result.members_affected} 人的積分，共 ${result.total_points_cleared} 分`);
    await loadData();
    render();
  } catch (err) {
    alert('清空失敗：' + err.message);
  }
}

async function deleteCheckinRecord(recordId) {
  if (!confirm('確定要刪除這筆簽到記錄嗎？\n\n積分將會扣回。')) return;

  try {
    const result = await api(`/api/checkin-records/${recordId}`, { method: 'DELETE' });
    showToast(`已刪除簽到記錄，扣回 ${result.points_deducted} 積分`);
    await loadData();
    render();
  } catch (err) {
    alert('刪除失敗：' + err.message);
  }
}

// UI Helpers
function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <span class="toast-icon">✓</span>
    <div>
      <div class="toast-title">成功</div>
      <div class="toast-message">${message}</div>
    </div>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

function getFilteredMembers() {
  return state.members.filter(member => {
    const matchesSearch = member.name.toLowerCase().includes(state.searchQuery.toLowerCase());
    const matchesTeam = state.teamFilter === '全部' || member.team === state.teamFilter;
    return matchesSearch && matchesTeam;
  });
}

function getMemberRecords(memberId) {
  return state.checkInRecords.filter(r => r.member_id === memberId);
}

// Render Functions
function renderHeader() {
  if (!state.isLoggedIn) {
    return `
      <header class="header">
        <div class="header-left">
          <div class="logo">✓</div>
          <span class="header-title">簽到積分系統</span>
        </div>
        <button class="btn btn-primary" onclick="showLoginModal()">管理員登入</button>
      </header>
    `;
  }

  return `
    <header class="header">
      <div class="header-left">
        <div class="logo">✓</div>
        <span class="header-title">簽到積分系統</span>
      </div>
      <div class="header-right">
        <span class="header-user">歡迎，${state.user?.name || '管理員'}</span>
        <button class="btn btn-secondary btn-small" onclick="logout()">登出</button>
      </div>
    </header>
  `;
}

function renderEditMemberModal(member) {
  return `
    <div class="modal-overlay" id="editMemberModal" onclick="if(event.target === this) hideEditMemberModal()">
      <div class="modal">
        <h2 class="modal-title">編輯人員</h2>
        <p class="modal-subtitle">修改人員資料</p>

        <div class="form-group">
          <label class="form-label">姓名</label>
          <input type="text" id="editMemberName" class="form-input" value="${member.name}" placeholder="請輸入姓名">
        </div>

        <div class="form-group">
          <label class="form-label">部門</label>
          <select class="form-select" id="editMemberTeam" style="width:100%">
            <option value="">無部門</option>
            ${state.teams.map(t => `<option value="${t.name}" ${member.team === t.name ? 'selected' : ''}>${t.name}</option>`).join('')}
          </select>
        </div>

        <div class="form-buttons">
          <button class="btn btn-secondary" onclick="hideEditMemberModal()">取消</button>
          <button class="btn btn-primary" onclick="submitEditMember('${member.id}')">儲存</button>
        </div>
      </div>
    </div>
  `;
}

function renderLoginModal() {
  return `
    <div class="modal-overlay" id="loginModal" onclick="if(event.target === this) hideLoginModal()">
      <div class="modal">
        <h2 class="modal-title">管理員登入</h2>
        <p class="modal-subtitle">登入後可管理人員、事件與簽到</p>

        <div id="loginError" class="form-error hidden"></div>

        <div class="form-group">
          <label class="form-label">帳號</label>
          <input type="text" id="loginUsername" class="form-input" placeholder="請輸入帳號">
        </div>

        <div class="form-group">
          <label class="form-label">密碼</label>
          <input type="password" id="loginPassword" class="form-input" placeholder="請輸入密碼">
        </div>

        <div class="form-buttons">
          <button class="btn btn-secondary" onclick="hideLoginModal()">取消</button>
          <button class="btn btn-primary" onclick="handleLoginSubmit()">登入</button>
        </div>

      </div>
    </div>
  `;
}

function renderPublicPage() {
  const sortedMembers = [...state.members].sort((a, b) => b.points - a.points);

  return `
    ${renderHeader()}
    <div class="public-page">
      <h1 class="public-title">🏆 積分排行榜</h1>
      <p class="public-subtitle">查看所有成員的積分排名與來源</p>

      <div class="list">
        ${sortedMembers.map((member, index) => {
          const records = getMemberRecords(member.id);
          const isExpanded = state.expandedLeaderboard === member.id;
          const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
          const rankDisplay = index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1;
          const rankColorClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';

          return `
            <div class="leaderboard-item ${rankClass}">
              <div class="leaderboard-rank ${rankColorClass}">${rankDisplay}</div>
              <div class="avatar">${member.name[0]}</div>
              <div class="leaderboard-info">
                <div class="leaderboard-name">${member.name}</div>
                <div class="leaderboard-team">${member.team || '無部門'}</div>
              </div>
              <div class="leaderboard-points ${index < 3 ? 'gold' : ''}">${member.points}</div>
              <div class="leaderboard-label">積分</div>
              <button class="btn btn-small ${isExpanded ? 'btn-primary' : 'btn-secondary'}"
                      onclick="toggleLeaderboardExpand('${member.id}')">
                ${isExpanded ? '收起 ▲' : '詳情 ▼'}
              </button>
            </div>
            ${isExpanded ? `
              <div class="records-panel">
                <div class="records-title">📋 積分來源（共 ${records.length} 筆）</div>
                ${records.length === 0 ? '<div class="text-muted">尚無簽到記錄</div>' :
                  records.map(r => `
                    <div class="record-item">
                      <div>
                        <div class="record-name">${r.event_name || '事件'}</div>
                        <div class="record-date">${r.checked_in_at?.split('T')[0] || ''}</div>
                      </div>
                      <div class="record-points">+${r.points_awarded}</div>
                    </div>
                  `).join('')
                }
              </div>
            ` : ''}
          `;
        }).join('')}
      </div>
    </div>
    <div id="loginModalContainer"></div>
  `;
}

function renderSidebar() {
  const tabs = [
    { id: 'checkin', icon: '✓', label: '批量簽到' },
    { id: 'members', icon: '👥', label: '人員管理' },
    { id: 'teams', icon: '🏢', label: '部門管理' },
    { id: 'events', icon: '📅', label: '事件管理' },
    { id: 'leaderboard', icon: '🏆', label: '積分排行' }
  ];

  return `
    <nav class="sidebar">
      ${tabs.map(tab => `
        <button class="nav-btn ${state.activeTab === tab.id ? 'active' : ''}"
                onclick="setActiveTab('${tab.id}')">
          <span class="nav-icon">${tab.icon}</span>
          ${tab.label}
        </button>
      `).join('')}
    </nav>
  `;
}

function renderCheckinPage() {
  const activeEvents = state.events.filter(e => e.status === 'active');
  const filteredMembers = getFilteredMembers();
  const teamOptions = ['全部', ...state.teams.map(t => t.name)];

  return `
    <div class="page-header">
      <h2 class="page-title">批量簽到</h2>
    </div>

    <div class="card">
      <h3 class="card-title">選擇簽到事件</h3>
      <div class="event-buttons">
        ${activeEvents.length === 0 ? '<p class="text-muted">目前沒有進行中的事件</p>' :
          activeEvents.map(event => `
            <button class="event-btn ${state.selectedEvent === event.id ? 'selected' : ''}"
                    onclick="selectEvent('${event.id}')">
              <div class="event-btn-name">${event.name}</div>
              <div class="event-btn-points">+${event.points} 積分</div>
            </button>
          `).join('')
        }
      </div>
    </div>

    <div class="search-bar">
      <input type="text" class="search-input" placeholder="🔍 搜索人員姓名..."
             oninput="handleSearchInput(event)">
      <select class="form-select" onchange="updateTeamFilter(this.value)">
        ${teamOptions.map(team => `
          <option value="${team}" ${state.teamFilter === team ? 'selected' : ''}>${team}</option>
        `).join('')}
      </select>
    </div>

    <div class="list">
      <div class="list-header">
        <label class="checkbox-label">
          <input type="checkbox" class="checkbox"
                 ${state.selectedMembers.size === filteredMembers.length && filteredMembers.length > 0 ? 'checked' : ''}
                 onchange="toggleSelectAll()">
          全選 (${state.selectedMembers.size}/${filteredMembers.length})
        </label>
      </div>
      ${filteredMembers.map(member => `
        <div class="list-item ${state.selectedMembers.has(member.id) ? 'selected' : ''}"
             onclick="toggleMember('${member.id}')">
          <input type="checkbox" class="checkbox"
                 ${state.selectedMembers.has(member.id) ? 'checked' : ''}
                 onclick="event.stopPropagation()">
          <div class="avatar">${member.name[0]}</div>
          <div class="flex-1">
            <div class="font-semibold mb-4">${member.name}</div>
            <div class="text-muted" style="font-size:13px">${member.team || '無部門'}</div>
          </div>
          <div class="badge">${member.points} 積分</div>
        </div>
      `).join('')}
    </div>

    <div class="mt-24" style="display:flex;justify-content:flex-end">
      <button class="btn btn-primary" style="padding:16px 32px;font-size:16px"
              onclick="handleCheckIn()"
              ${!state.selectedEvent || state.selectedMembers.size === 0 ? 'disabled' : ''}>
        確認簽到 (${state.selectedMembers.size} 人)
      </button>
    </div>
  `;
}

function renderMembersPage() {
  const filteredMembers = getFilteredMembers();
  const teamOptions = ['全部', ...state.teams.map(t => t.name)];

  return `
    <div class="page-header">
      <h2 class="page-title">人員管理</h2>
      <button class="btn btn-primary" onclick="toggleMemberForm()">+ 新增人員</button>
    </div>

    <div class="card hidden" id="memberForm">
      <div class="inline-form">
        <input type="text" class="form-input" id="newMemberName" placeholder="姓名">
        <select class="form-select" id="newMemberTeam">
          <option value="">選擇部門</option>
          ${state.teams.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
        </select>
        <button class="btn btn-success" onclick="submitNewMember()">確認新增</button>
      </div>
    </div>

    <div class="search-bar">
      <input type="text" class="search-input" placeholder="🔍 搜索人員姓名..."
             oninput="handleSearchInput(event)">
      <select class="form-select" onchange="updateTeamFilter(this.value)">
        ${teamOptions.map(team => `
          <option value="${team}" ${state.teamFilter === team ? 'selected' : ''}>${team}</option>
        `).join('')}
      </select>
    </div>

    <div class="grid">
      ${filteredMembers.length === 0 ? '<p class="text-muted" style="grid-column:1/-1;text-align:center;padding:40px">沒有符合條件的人員</p>' : ''}
      ${filteredMembers.map(member => {
        const records = getMemberRecords(member.id);
        const isExpanded = state.expandedMember === member.id;
        return `
          <div class="member-card">
            <div class="member-card-header">
              <div class="avatar avatar-large">${member.name[0]}</div>
              <div class="member-card-info">
                <div class="member-card-name">${member.name}</div>
                <div class="member-card-team">${member.team || '無部門'}</div>
              </div>
              <div class="member-card-actions">
                <button class="btn btn-secondary btn-small" onclick="showEditMemberModal('${member.id}')">編輯</button>
                <button class="btn btn-danger btn-small" onclick="deleteMember('${member.id}')">刪除</button>
              </div>
            </div>
            <div class="member-card-points">
              <div class="member-card-points-value">${member.points}</div>
              <div class="member-card-points-label">累計積分</div>
            </div>
            <button class="btn btn-secondary btn-small mt-12" style="width:100%"
                    onclick="toggleMemberExpand('${member.id}')">
              ${isExpanded ? '收起積分來源 ▲' : '查看積分來源 ▼'}
            </button>
            ${isExpanded ? `
              <div class="records-panel" style="padding:16px;margin-top:12px;background:rgba(0,0,0,0.2);border-radius:12px">
                <div class="records-title" style="padding-left:0">積分來源（點擊可刪除）</div>
                ${records.length === 0 ? '<div class="text-muted">暫無簽到記錄</div>' :
                  records.map(r => `
                    <div class="record-item" style="cursor:pointer" onclick="deleteCheckinRecord('${r.id}')" title="點擊刪除此記錄">
                      <div>
                        <div class="record-name">${r.event_name || '事件'}</div>
                        <div class="record-date">${r.checked_in_at?.split('T')[0] || ''}</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px">
                        <div class="record-points">+${r.points_awarded}</div>
                        <span style="color:#fca5a5;font-size:16px">✕</span>
                      </div>
                    </div>
                  `).join('')
                }
              </div>
            ` : ''}
          </div>
        `;
      }).join('')}
    </div>
    <div id="editMemberModalContainer"></div>
  `;
}

function renderTeamsPage() {
  return `
    <div class="page-header">
      <h2 class="page-title">部門管理</h2>
      <button class="btn btn-primary" onclick="toggleTeamForm()">+ 新增部門</button>
    </div>

    <div class="card hidden" id="teamForm">
      <div class="inline-form">
        <input type="text" class="form-input" id="newTeamName" placeholder="部門名稱">
        <input type="text" class="form-input" id="newTeamDesc" placeholder="部門說明（選填）" style="flex:2">
        <button class="btn btn-success" onclick="submitNewTeam()">確認新增</button>
      </div>
    </div>

    <div class="list">
      ${state.teams.map(team => {
        const memberCount = state.members.filter(m => m.team === team.name).length;
        return `
          <div class="list-item" style="cursor:default">
            <div class="avatar">🏢</div>
            <div class="flex-1">
              <div class="font-semibold mb-4">${team.name}</div>
              <div class="text-muted" style="font-size:13px">${team.description || '無說明'}</div>
            </div>
            <div class="badge badge-primary" style="margin-right:16px">${memberCount} 人</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderEventsPage() {
  return `
    <div class="page-header">
      <h2 class="page-title">事件管理</h2>
      <button class="btn btn-primary" onclick="toggleEventForm()">+ 新增事件</button>
    </div>

    <div class="card hidden" id="eventForm">
      <div class="inline-form">
        <input type="text" class="form-input" id="newEventName" placeholder="事件名稱">
        <input type="number" class="form-input" id="newEventPoints" placeholder="積分" value="0.5" step="0.1" style="width:100px">
        <input type="date" class="form-input" id="newEventDate" style="width:160px">
        <button class="btn btn-success" onclick="submitNewEvent()">確認新增</button>
      </div>
    </div>

    <div class="list">
      ${state.events.map(event => {
        const statusClass = event.status === 'active' ? 'status-active' : 'status-completed';
        return `
          <div class="list-item" style="cursor:default">
            <div class="avatar" style="background:${event.status === 'active' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' :
                                                     'rgba(255,255,255,0.1)'}">📅</div>
            <div class="flex-1">
              <div class="font-semibold mb-4">${event.name}</div>
              <div class="text-muted" style="font-size:13px">${event.date}</div>
            </div>
            <div class="badge badge-primary" style="margin-right:16px">+${event.points} 積分</div>
            <select class="form-select ${statusClass}" style="padding:8px 12px;border-radius:20px;margin-right:12px"
                    onchange="updateEventStatus('${event.id}', this.value)">
              <option value="active" ${event.status === 'active' ? 'selected' : ''}>進行中</option>
              <option value="completed" ${event.status === 'completed' ? 'selected' : ''}>已結束</option>
            </select>
            <button class="btn btn-danger btn-small" onclick="deleteEvent('${event.id}')">刪除</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderLeaderboardPage() {
  const sortedMembers = [...state.members].sort((a, b) => b.points - a.points);
  const totalPoints = state.members.reduce((sum, m) => sum + m.points, 0);

  return `
    <div class="page-header">
      <h2 class="page-title">積分排行榜</h2>
      <div style="display:flex;align-items:center;gap:16px">
        <span class="text-muted">總積分：${totalPoints}</span>
        ${totalPoints > 0 ? `
          <button class="btn btn-danger btn-small" onclick="resetAllPoints()">
            🗑️ 清空所有積分
          </button>
        ` : ''}
      </div>
    </div>

    <div class="list">
      ${sortedMembers.map((member, index) => {
        const records = getMemberRecords(member.id);
        const isExpanded = state.expandedLeaderboard === member.id;
        const rankClass = index === 0 ? 'top-1' : index === 1 ? 'top-2' : index === 2 ? 'top-3' : '';
        const rankDisplay = index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1;
        const rankColorClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';

        return `
          <div class="leaderboard-item ${rankClass}">
            <div class="leaderboard-rank ${rankColorClass}">${rankDisplay}</div>
            <div class="avatar">${member.name[0]}</div>
            <div class="leaderboard-info">
              <div class="leaderboard-name">${member.name}</div>
              <div class="leaderboard-team">${member.team || '無部門'}</div>
            </div>
            <div class="leaderboard-points ${index < 3 ? 'gold' : ''}">${member.points}</div>
            <div class="leaderboard-label">積分</div>
            <button class="btn btn-small ${isExpanded ? 'btn-primary' : 'btn-secondary'}"
                    onclick="toggleLeaderboardExpand('${member.id}')">
              ${isExpanded ? '收起 ▲' : '詳情 ▼'}
            </button>
          </div>
          ${isExpanded ? `
            <div class="records-panel">
              <div class="records-title">📋 積分來源（共 ${records.length} 筆）</div>
              ${records.length === 0 ? '<div class="text-muted">尚無簽到記錄</div>' :
                records.map(r => `
                  <div class="record-item">
                    <div>
                      <div class="record-name">${r.event_name || '事件'}</div>
                      <div class="record-date">${r.checked_in_at?.split('T')[0] || ''}</div>
                    </div>
                    <div class="record-points">+${r.points_awarded}</div>
                  </div>
                `).join('')
              }
            </div>
          ` : ''}
        `;
      }).join('')}
    </div>
  `;
}

function renderMainContent() {
  switch (state.activeTab) {
    case 'checkin': return renderCheckinPage();
    case 'members': return renderMembersPage();
    case 'teams': return renderTeamsPage();
    case 'events': return renderEventsPage();
    case 'leaderboard': return renderLeaderboardPage();
    default: return '';
  }
}

function renderApp() {
  return `
    ${renderHeader()}
    <div class="app-layout">
      ${renderSidebar()}
      <main class="main-content">
        ${renderMainContent()}
      </main>
    </div>
  `;
}

function render() {
  const app = $('#app');

  if (!state.isLoggedIn) {
    app.innerHTML = renderPublicPage();
  } else {
    app.innerHTML = renderApp();
  }
}

// Event Handlers
window.showLoginModal = function() {
  const container = $('#loginModalContainer');
  if (container) {
    container.innerHTML = renderLoginModal();
  }
};

window.hideLoginModal = function() {
  const container = $('#loginModalContainer');
  if (container) {
    container.innerHTML = '';
  }
};

window.handleLoginSubmit = async function() {
  const username = $('#loginUsername').value;
  const password = $('#loginPassword').value;
  const errorEl = $('#loginError');

  const error = await login(username, password);
  if (error) {
    errorEl.textContent = error;
    errorEl.classList.remove('hidden');
  }
};


window.setActiveTab = function(tab) {
  state.activeTab = tab;
  render();
};

window.selectEvent = function(eventId) {
  state.selectedEvent = eventId;
  render();
};

window.toggleMember = function(memberId) {
  if (state.selectedMembers.has(memberId)) {
    state.selectedMembers.delete(memberId);
  } else {
    state.selectedMembers.add(memberId);
  }
  render();
};

window.toggleSelectAll = function() {
  const filtered = getFilteredMembers();
  if (state.selectedMembers.size === filtered.length) {
    state.selectedMembers.clear();
  } else {
    filtered.forEach(m => state.selectedMembers.add(m.id));
  }
  render();
};

let searchTimeout = null;
window.handleSearchInput = function(event) {
  const value = event.target.value;
  state.searchQuery = value;

  // 使用防抖動延遲渲染，讓輸入法有時間完成
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    // 只更新列表，不重新渲染整個頁面
    updateMembersList();
  }, 300);
};

function updateMembersList() {
  // 找到列表容器並只更新內容
  const listContainer = document.querySelector('.main-content .list, .main-content .grid');
  if (!listContainer) {
    render();
    return;
  }

  const filteredMembers = getFilteredMembers();

  // 根據當前頁面類型更新
  if (state.activeTab === 'checkin') {
    updateCheckinList(filteredMembers);
  } else if (state.activeTab === 'members') {
    updateMembersGrid(filteredMembers);
  }
}

function updateCheckinList(members) {
  const container = document.querySelector('.main-content .list');
  if (!container) return;

  // 保留 header
  const header = container.querySelector('.list-header');
  const headerHTML = header ? header.outerHTML : '';

  container.innerHTML = headerHTML + members.map(member => `
    <div class="list-item ${state.selectedMembers.has(member.id) ? 'selected' : ''}"
         onclick="toggleMember('${member.id}')">
      <input type="checkbox" class="checkbox"
             ${state.selectedMembers.has(member.id) ? 'checked' : ''}
             onclick="event.stopPropagation()">
      <div class="avatar">${member.name[0]}</div>
      <div class="flex-1">
        <div class="font-semibold mb-4">${member.name}</div>
        <div class="text-muted" style="font-size:13px">${member.team || '無部門'}</div>
      </div>
      <div class="badge">${member.points} 積分</div>
    </div>
  `).join('');

  // 更新 header 的計數
  if (header) {
    const newHeader = container.querySelector('.list-header');
    if (newHeader) {
      newHeader.innerHTML = `
        <label class="checkbox-label">
          <input type="checkbox" class="checkbox"
                 ${state.selectedMembers.size === members.length && members.length > 0 ? 'checked' : ''}
                 onchange="toggleSelectAll()">
          全選 (${state.selectedMembers.size}/${members.length})
        </label>
      `;
    }
  }
}

function updateMembersGrid(members) {
  const container = document.querySelector('.main-content .grid');
  if (!container) return;

  if (members.length === 0) {
    container.innerHTML = '<p class="text-muted" style="grid-column:1/-1;text-align:center;padding:40px">沒有符合條件的人員</p>';
    return;
  }

  container.innerHTML = members.map(member => {
    const records = getMemberRecords(member.id);
    const isExpanded = state.expandedMember === member.id;
    return `
      <div class="member-card">
        <div class="member-card-header">
          <div class="avatar avatar-large">${member.name[0]}</div>
          <div class="member-card-info">
            <div class="member-card-name">${member.name}</div>
            <div class="member-card-team">${member.team || '無部門'}</div>
          </div>
          <div class="member-card-actions">
            <button class="btn btn-secondary btn-small" onclick="showEditMemberModal('${member.id}')">編輯</button>
            <button class="btn btn-danger btn-small" onclick="deleteMember('${member.id}')">刪除</button>
          </div>
        </div>
        <div class="member-card-points">
          <div class="member-card-points-value">${member.points}</div>
          <div class="member-card-points-label">累計積分</div>
        </div>
        <button class="btn btn-secondary btn-small mt-12" style="width:100%"
                onclick="toggleMemberExpand('${member.id}')">
          ${isExpanded ? '收起積分來源 ▲' : '查看積分來源 ▼'}
        </button>
        ${isExpanded ? `
          <div class="records-panel" style="padding:16px;margin-top:12px;background:rgba(0,0,0,0.2);border-radius:12px">
            <div class="records-title" style="padding-left:0">積分來源（點擊可刪除）</div>
            ${records.length === 0 ? '<div class="text-muted">暫無簽到記錄</div>' :
              records.map(r => `
                <div class="record-item" style="cursor:pointer" onclick="deleteCheckinRecord('${r.id}')" title="點擊刪除此記錄">
                  <div>
                    <div class="record-name">${r.event_name || '事件'}</div>
                    <div class="record-date">${r.checked_in_at?.split('T')[0] || ''}</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div class="record-points">+${r.points_awarded}</div>
                    <span style="color:#fca5a5;font-size:16px">✕</span>
                  </div>
                </div>
              `).join('')
            }
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

window.updateSearch = function(value) {
  state.searchQuery = value;
  render();
};

window.updateTeamFilter = function(value) {
  state.teamFilter = value;
  render();
  // 恢復搜尋框的值
  const searchInput = document.querySelector('.search-input');
  if (searchInput && state.searchQuery) {
    searchInput.value = state.searchQuery;
  }
};

window.toggleMemberExpand = function(memberId) {
  state.expandedMember = state.expandedMember === memberId ? null : memberId;
  render();
};

window.toggleLeaderboardExpand = function(memberId) {
  state.expandedLeaderboard = state.expandedLeaderboard === memberId ? null : memberId;
  render();
};

window.toggleMemberForm = function() {
  $('#memberForm').classList.toggle('hidden');
};

window.toggleTeamForm = function() {
  $('#teamForm').classList.toggle('hidden');
};

window.toggleEventForm = function() {
  $('#eventForm').classList.toggle('hidden');
};

window.submitNewMember = function() {
  const name = $('#newMemberName').value.trim();
  const team = $('#newMemberTeam').value || null;
  if (name) {
    addMember(name, team);
    $('#newMemberName').value = '';
    $('#newMemberTeam').value = '';
    $('#memberForm').classList.add('hidden');
  }
};

window.showEditMemberModal = function(memberId) {
  const member = state.members.find(m => m.id === memberId);
  if (!member) return;
  const container = $('#editMemberModalContainer');
  if (container) {
    container.innerHTML = renderEditMemberModal(member);
  }
};

window.hideEditMemberModal = function() {
  const container = $('#editMemberModalContainer');
  if (container) {
    container.innerHTML = '';
  }
};

window.submitEditMember = function(memberId) {
  const name = $('#editMemberName').value.trim();
  const team = $('#editMemberTeam').value || null;
  if (name) {
    updateMember(memberId, { name, team });
    hideEditMemberModal();
  }
};

window.submitNewTeam = function() {
  const name = $('#newTeamName').value;
  const desc = $('#newTeamDesc').value;
  if (name) {
    addTeam(name, desc);
    $('#newTeamName').value = '';
    $('#newTeamDesc').value = '';
    $('#teamForm').classList.add('hidden');
  }
};

window.submitNewEvent = function() {
  const name = $('#newEventName').value;
  const points = $('#newEventPoints').value;
  const date = $('#newEventDate').value;
  if (name && date) {
    addEvent(name, points, date);
    $('#newEventName').value = '';
    $('#newEventPoints').value = '0.5';
    $('#newEventDate').value = '';
    $('#eventForm').classList.add('hidden');
  }
};

// Initialize
async function init() {
  // 嘗試恢復登入狀態
  const hasSession = restoreSession();

  if (hasSession) {
    // 已登入，載入完整資料
    try {
      await loadData();
    } catch (err) {
      // Token 可能過期，清除登入狀態
      logout();
    }
  } else {
    // 未登入，載入公開資料
    try {
      const [membersRes, teamsRes, eventsRes] = await Promise.all([
        fetch(`${API_URL}/api/members`).then(r => r.ok ? r.json() : { members: [] }).catch(() => ({ members: [] })),
        fetch(`${API_URL}/api/teams`).then(r => r.ok ? r.json() : { teams: [] }).catch(() => ({ teams: [] })),
        fetch(`${API_URL}/api/events`).then(r => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] }))
      ]);

      state.members = membersRes.members || [];
      state.teams = teamsRes.teams || [];
      state.events = eventsRes.events || [];
    } catch (err) {
      console.log('Failed to load data');
    }
  }

  render();
}

init();
