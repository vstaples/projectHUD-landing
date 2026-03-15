// ============================================================
// ProjectHUD — api.js
// All Supabase REST API calls
// Depends on: config.js, auth.js
// ============================================================

const API = (() => {

  // ── CORE FETCH ─────────────────────────────────────────────
  async function query(path, options = {}) {
    const { method = 'GET', body, headers: extraHeaders = {} } = options;
    const headers = {
      'apikey':        PHUD.SUPABASE_KEY,
      'Authorization': `Bearer ${Auth.getToken()}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...extraHeaders
    };
    const res = await fetch(`${PHUD.SUPABASE_URL}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`API ${method} ${path} → ${res.status}: ${err}`);
    }
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  const get    = (path)         => query(path);
  const post   = (path, body)   => query(path, { method: 'POST', body });
  const patch  = (path, body)   => query(path, { method: 'PATCH', body });
  const del    = (path)         => query(path, { method: 'DELETE' });

  // ── DOMAIN METHODS ─────────────────────────────────────────

  // Firms
  const getFirms      = ()       => get('firms?select=*');
  const getInternalFirm = ()     => get('firms?select=*&is_internal=eq.true&limit=1').then(r => r?.[0]);

  // Users
  const getUsers      = ()       => get('users?select=*');
  const getUserById   = (id)     => get(`users?select=*&id=eq.${id}&limit=1`).then(r => r?.[0]);

  // Projects
  const getProjects   = ()       => get('projects?select=*&order=created_at.desc');
  const getProjectById = (id)    => get(`projects?select=*&id=eq.${id}&limit=1`).then(r => r?.[0]);
  const getActiveProjects = ()   => get('projects?select=*&status=eq.active&order=created_at.desc');

  // Tasks
  const getTasks      = ()       => get('tasks?select=*&order=due_date.asc');
  const getTasksByProject = (id) => get(`tasks?select=*&project_id=eq.${id}&order=sequence_order.asc`);
  const updateTask    = (id, body) => patch(`tasks?id=eq.${id}`, body);

  // Milestones
  const getMilestonesByProject = (id) => get(`milestones?select=*&project_id=eq.${id}&order=sequence_order.asc`);

  // Action Items
  const getActionItems = ()      => get('action_items?select=*&status=neq.complete&order=target_date.asc');
  const getActionItemsByProject = (id) => get(`action_items?select=*&project_id=eq.${id}&order=target_date.asc`);

  // Risk Register
  const getRisksByProject = (id) => get(`risk_register?select=*&project_id=eq.${id}&order=weighted_score.desc`);

  // Documents
  const getDocumentsByProject = (id) => get(`documents?select=*&project_id=eq.${id}&order=created_at.desc`);

  // Messages
  const getMessagesByProject = (id) => get(`messages?select=*&project_id=eq.${id}&order=created_at.asc`);
  const sendMessage = (body)     => post('messages', body);

  // Meetings
  const getMeetingsByProject = (id) => get(`meetings?select=*&project_id=eq.${id}&order=scheduled_date.desc`);

  // Task Journal
  const getJournalByTask = (taskId) => get(`task_journal?select=*&task_id=eq.${taskId}&order=entry_date.desc`);
  const addJournalEntry = (body)    => post('task_journal', body);

  // Notifications
  const getNotifications = ()    => get('notifications?select=*&status=eq.unread&order=created_at.desc');
  const markNotifRead = (id)     => patch(`notifications?id=eq.${id}`, { status: 'read' });

  // Audit Log
  const logAudit = (body)        => post('audit_log', body);

  // Tenant Settings
  const getTenantSettings = ()   => get('tenant_settings?select=*&limit=1').then(r => r?.[0]);

  // Invoices
  const getInvoicesByProject = (id) => get(`invoices?select=*&project_id=eq.${id}&order=created_at.desc`);

  return {
    get, post, patch, del,
    getFirms, getInternalFirm,
    getUsers, getUserById,
    getProjects, getProjectById, getActiveProjects,
    getTasks, getTasksByProject, updateTask,
    getMilestonesByProject,
    getActionItems, getActionItemsByProject,
    getRisksByProject,
    getDocumentsByProject,
    getMessagesByProject, sendMessage,
    getMeetingsByProject,
    getJournalByTask, addJournalEntry,
    getNotifications, markNotifRead,
    logAudit,
    getTenantSettings,
    getInvoicesByProject,
  };

})();