// ─────────────────────────────────────────────────────────────────────────────
// coc.js  —  ProjectHUD / Compass  ·  Platform Chain of Custody Service
// ─────────────────────────────────────────────────────────────────────────────
//
// THE SINGLE TABLE: coc_events
// ─────────────────────────────────────────────────────────────────────────────
// Every observable action taken by any actor on any entity flows through here.
// This replaces and unifies four previously separate mechanisms:
//
//   REPLACED TABLE              LEGACY CALLER          NOW MAPS TO
//   ─────────────────────────── ────────────────────── ────────────────────────
//   exception_annotations       projects.html          event_class: 'exception'
//   audit_log                   project-detail.html    event_class: 'audit'
//   task_journal                project-detail.html    event_class: 'progress'
//   resource_request_events     projects.html          event_class: 'request'
//   coc_events (original)       compass/* / cadence/*  event_class: 'workflow' |
//                                                        'task' | 'calendar' |
//                                                        'timesheet' | ...
//
// SCHEMA: coc_events
// ─────────────────────────────────────────────────────────────────────────────
//   id                UUID        PK, crypto.randomUUID()
//   firm_id           UUID        always required
//
//   -- WHAT happened --
//   event_class       TEXT        top-level category (see EVENT_CLASS enum)
//   event_type        TEXT        specific verb      (see EVENT_TYPE enum)
//   step_name         TEXT        human-readable label shown in timeline UI
//   event_notes       TEXT        free-text detail / narrative
//
//   -- TO WHAT --
//   entity_type       TEXT        what kind of thing this event is about
//   entity_id         UUID        id of that thing
//   project_id        UUID        nullable — the project context (for fast project-scoped queries)
//   instance_id       UUID        nullable — workflow instance context (cadence)
//   template_step_id  UUID        nullable — which step in a template (cadence)
//
//   -- WHO --
//   actor_resource_id UUID        nullable — resource row id of the human actor
//   actor_name        TEXT        denormalized display name  (survives resource deletes)
//   actor_role        TEXT        nullable — 'pm' | 'ic' | 'manager' | 'system' | ...
//
//   -- SIGNAL --
//   outcome           TEXT        nullable — 'on_track' | 'at_risk' | 'blocked' |
//                                            'resolved' | 'submitted' | 'pending' | ...
//   severity          TEXT        nullable — 'info' | 'warn' | 'critical'
//
//   -- LEGACY FIELDS (preserved via metadata JSONB rather than columns) --
//   metadata          JSONB       nullable — carries legacy-specific fields:
//                                   exception: { action_type, before_priority, after_priority }
//                                   audit:     { affected_table, before_value, after_value }
//                                   progress:  { hours_spent, pct_complete, blockers }
//                                   request:   { request_id, actor_role, heartbeat_tier }
//
//   -- TIMESTAMPS --
//   occurred_at       TIMESTAMPTZ  when the action actually happened (may differ from created_at)
//   created_at        TIMESTAMPTZ  when this row was inserted
//   updated_at        TIMESTAMPTZ  last touch
//
// ─────────────────────────────────────────────────────────────────────────────
// USAGE
// ─────────────────────────────────────────────────────────────────────────────
//
//   // Write:
//   await window.CoC.write('task.completed', taskId, { notes: 'Done early' });
//   await window.CoC.write('exception.intervention', taskId, { notes: 'Reassigned to Alice', projectId: projId });
//   await window.CoC.write('audit.field_change', taskId, { meta: { affected_table:'tasks', before_value:'Open', after_value:'Closed' } });
//   await window.CoC.write('progress.update', taskId, { notes: '6h logged', meta: { hours_spent:6, pct_complete:80 } });
//
//   // Read (returns unified sorted array):
//   const events = await window.CoC.read('task', taskId);
//
//   // Render a timeline widget into a container:
//   window.CoC.render('task', taskId, document.getElementById('coc-panel'));
//
// ─────────────────────────────────────────────────────────────────────────────
// IDENTITY RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────
// CoC.write() resolves the actor from the platform identity chain, in order:
//   1. window.CURRENT_USER              { id, name, role }   ← new platform global
//   2. window._myResource               { id, name }         ← compass IC identity
//   3. window.CURRENT_USER_RESOURCE_ID  string UUID          ← legacy projects.html
//   4. STATE.currentUserId              string               ← legacy project-detail.html
//   5. null / 'System'                  fallback
//
// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM RULE (embed in every module header that touches CoC)
// ─────────────────────────────────────────────────────────────────────────────
// «Any observable action taken by any actor on any entity MUST be written
//  through window.CoC.write(). Direct API.post('coc_events', ...) calls are
//  BANNED in all new code. Legacy direct writes are tolerated only until
//  the calling module is refactored.»
// ─────────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────────

  // CMD-AEGIS-1.1: hardcoded firm A fallback removed. Was previously:
  //   const FIRM_ID = window.FIRM_ID || 'aaaaaaaa-0001-0001-0001-000000000001';
  // That fallback caused every CoC.write() — regardless of authenticated firm
  // — to fall through to firm A's UUID. CMD-AEGIS-1 fixed cmd-center.js's
  // version; CMD-A6 surfaced this duplicate; CMD-AEGIS-1.1 closes it.
  // The variable is read at write-time (see write() below) so that a deferred
  // identity resolution via Auth.ensureFirmId() is picked up automatically.
  const FIRM_ID = (typeof window !== 'undefined' && window.FIRM_ID) || null;

  // ── Event vocabulary ─────────────────────────────────────────────────────────
  // Format: 'event_class.event_type'
  // event_class drives the metadata shape; event_type is the specific verb.

  const EVENT_META = {
    // ── TASK LIFECYCLE ────────────────────────────────────────────────────────
    'task.created':              { stepName: 'Task created',            severity: 'info'  },
    'task.updated':              { stepName: 'Task updated',            severity: 'info'  },
    'task.assigned':             { stepName: 'Task assigned',           severity: 'info'  },
    'task.started':              { stepName: 'Task started',            severity: 'info'  },
    'task.completed':            { stepName: 'Task completed',          severity: 'info'  },
    'task.blocked':              { stepName: 'Task blocked',            severity: 'warn'  },
    'task.unblocked':            { stepName: 'Task unblocked',          severity: 'info'  },
    'task.deleted':              { stepName: 'Task deleted',            severity: 'warn'  },

    // ── EXCEPTION TRIAGE (replaces exception_annotations) ────────────────────
    'exception.raised':          { stepName: 'Exception raised',        severity: 'warn'  },
    'exception.intervention':    { stepName: 'Intervention',            severity: 'warn'  },
    'exception.note':            { stepName: 'Exception note',          severity: 'info'  },
    'exception.priority_set':    { stepName: 'Priority set',            severity: 'info'  },
    'exception.status_set':      { stepName: 'Exception status set',    severity: 'info'  },
    'exception.acknowledgment':  { stepName: 'Exception acknowledged',  severity: 'info'  },
    'exception.resolution':      { stepName: 'Exception resolved',      severity: 'info'  },
    'exception.action_item':     { stepName: 'Action item logged',      severity: 'info'  },
    'exception.escalated':       { stepName: 'Escalated',               severity: 'critical' },

    // ── AUDIT / FIELD CHANGES (replaces audit_log) ────────────────────────────
    'audit.field_change':        { stepName: 'Field changed',           severity: 'info'  },
    'audit.record_created':      { stepName: 'Record created',          severity: 'info'  },
    'audit.record_deleted':      { stepName: 'Record deleted',          severity: 'warn'  },
    'audit.permission_change':   { stepName: 'Permission changed',      severity: 'warn'  },

    // ── PROGRESS REPORTING (replaces task_journal) ────────────────────────────
    'progress.update':           { stepName: 'Progress update',         severity: 'info'  },
    'progress.milestone':        { stepName: 'Milestone reached',       severity: 'info'  },
    'progress.blocker_noted':    { stepName: 'Blocker noted',           severity: 'warn'  },
    'progress.blocker_cleared':  { stepName: 'Blocker cleared',         severity: 'info'  },

    // ── RESOURCE / STAFFING (replaces resource_request_events) ───────────────
    'request.submitted':         { stepName: 'Resource request submitted', severity: 'info' },
    'request.approved':          { stepName: 'Resource request approved',  severity: 'info' },
    'request.rejected':          { stepName: 'Resource request rejected',  severity: 'warn' },
    'request.fulfilled':         { stepName: 'Resource request fulfilled', severity: 'info' },
    'request.withdrawn':         { stepName: 'Resource request withdrawn', severity: 'info' },

    // ── WORKFLOW / CADENCE INSTANCE ───────────────────────────────────────────
    'workflow.instance_launched':  { stepName: 'Workflow launched',     severity: 'info'  },
    'workflow.instance_completed': { stepName: 'Workflow completed',    severity: 'info'  },
    'workflow.instance_suspended': { stepName: 'Workflow suspended',    severity: 'warn'  },
    'workflow.instance_cancelled': { stepName: 'Workflow cancelled',    severity: 'warn'  },
    'workflow.step_activated':     { stepName: 'Step activated',        severity: 'info'  },
    'workflow.step_completed':     { stepName: 'Step completed',        severity: 'info'  },
    'workflow.step_reset':         { stepName: 'Step reset',            severity: 'warn'  },
    'workflow.step_reassigned':    { stepName: 'Step reassigned',       severity: 'info'  },
    'workflow.step_assignee_override': { stepName: 'Assignee override', severity: 'warn'  },
    'workflow.step_reassignment_removed': { stepName: 'Reassignment removed', severity: 'info' },
    'workflow.rejected':           { stepName: 'Step rejected',         severity: 'warn'  },
    'workflow.management_decision':{ stepName: 'Management decision',   severity: 'info'  },
    'workflow.intervention':       { stepName: 'Intervention',          severity: 'warn'  },
    'workflow.flag_acknowledged':  { stepName: 'Flag acknowledged',     severity: 'info'  },
    'workflow.meeting_created':    { stepName: 'Meeting created',       severity: 'info'  },

    // ── CALENDAR / SCHEDULING ─────────────────────────────────────────────────
    'calendar.reposition':       { stepName: 'Calendar slot moved',     severity: 'info'  },
    'calendar.slice_deleted':    { stepName: 'Calendar slice removed',  severity: 'warn'  },
    'calendar.item_added':       { stepName: 'Item added to calendar',  severity: 'info'  },

    // ── TIMESHEET / TIME ──────────────────────────────────────────────────────
    'timesheet.submitted':       { stepName: 'Timesheet submitted',     severity: 'info'  },
    'timesheet.approved':        { stepName: 'Timesheet approved',      severity: 'info'  },
    'timesheet.plan_submitted':  { stepName: 'Next week plan submitted',severity: 'info'  },

    // ── NEGOTIATION (action item LOE) ─────────────────────────────────────────
    'negotiation.loe_proposed':  { stepName: 'LOE proposed',            severity: 'info'  },
    'negotiation.loe_accepted':  { stepName: 'LOE accepted',            severity: 'info'  },
    'negotiation.loe_countered': { stepName: 'LOE countered',           severity: 'info'  },
    'negotiation.escalated':     { stepName: 'Negotiation escalated',   severity: 'warn'  },

    // ── DOCUMENT / DELIVERABLE ────────────────────────────────────────────────
    'document.uploaded':         { stepName: 'Document uploaded',       severity: 'info'  },
    'document.approved':         { stepName: 'Document approved',       severity: 'info'  },
    'document.rejected':         { stepName: 'Document rejected',       severity: 'warn'  },

    // ── MEETING OUTCOMES ──────────────────────────────────────────────────────
    'meeting.started':           { stepName: 'Meeting started',         severity: 'info'  },
    'meeting.completed':         { stepName: 'Meeting completed',       severity: 'info'  },
    'meeting.outcome_set':       { stepName: 'Meeting outcome set',     severity: 'info'  },
    'meeting.no_consensus':      { stepName: 'No consensus reached',    severity: 'warn'  },

    // ── ACCORD MODULE (Evidence Layer · Iron Rules 41, 42, 44, 45, 46) ────────
    // Sealed = Iron-Rule-42 commit moment. Post-seal artifacts are structurally
    // immutable; "change" expressed via archive / supersede / retract.
    'accord.node.sealed':         { glyph: '●', stepName: 'Node sealed',           severity: 'info', color: '#1D9E75' },
    'accord.edge.sealed':         { glyph: '↗', stepName: 'Edge sealed',           severity: 'info', color: '#5B7FFF' },
    'accord.belief.adjusted':     { glyph: '±', stepName: 'Belief adjusted',       severity: 'info', color: '#EF9F27' },
    'accord.node.archived':       { glyph: '⊘', stepName: 'Node archived',         severity: 'info', color: 'rgba(255,255,255,.4)' },
    'accord.node.restored':       { glyph: '⊕', stepName: 'Node restored',         severity: 'info', color: '#1D9E75' },
    'accord.decision.superseded': { glyph: '↻', stepName: 'Decision superseded',   severity: 'warn', color: '#EF9F27' },
    'accord.edge.retracted':      { glyph: '✕', stepName: 'Edge retracted',        severity: 'warn', color: '#E24B4A' },
    'accord.meeting.ended':       { glyph: '▣', stepName: 'Meeting sealed',        severity: 'info', color: '#5B7FFF' },
    'accord.digest.delivered':    { glyph: '✉', stepName: 'Digest delivered',      severity: 'info', color: '#5B7FFF' },
    'accord.minutes.rendered':    { glyph: '⎙', stepName: 'Minutes rendered',      severity: 'info', color: '#1D9E75' },
    'accord.minutes.render_failed': { glyph: '✕', stepName: 'Minutes render failed', severity: 'error', color: '#E24B4A' },
    'risk.registered':            { glyph: '⚠', stepName: 'Risk registered',       severity: 'warn', color: '#EF9F27' },

    // ── PIPELINE / CRM ────────────────────────────────────────────────────────
    // Prospect lifecycle from first contact through project handoff.
    // entity_type = 'prospect' | 'proposal' | 'sow_document' | 'project'
    'pipeline.prospect_created':     { stepName: 'Prospect created',        severity: 'info'  },
    'pipeline.stage_changed':        { stepName: 'Stage advanced',          severity: 'info'  },
    'pipeline.prospect_qualified':   { stepName: 'Prospect qualified',      severity: 'info'  },
    'pipeline.prospect_approved':    { stepName: 'Prospect approved',       severity: 'info'  },
    'pipeline.prospect_declined':    { stepName: 'Prospect declined',       severity: 'warn'  },
    'pipeline.proposal_created':     { stepName: 'Proposal created',        severity: 'info'  },
    'pipeline.proposal_approved':    { stepName: 'Proposal approved',       severity: 'info'  },
    'pipeline.converted_to_project': { stepName: 'Converted to project',    severity: 'info'  },
    'pipeline.sow_saved':            { stepName: 'SOW saved',               severity: 'info'  },
    'pipeline.sow_published':        { stepName: 'SOW published',           severity: 'info'  },

    // ── SYSTEM ────────────────────────────────────────────────────────────────
    'system.import':             { stepName: 'Data imported',           severity: 'info'  },
    'system.export':             { stepName: 'Data exported',           severity: 'info'  },
    'system.config_changed':     { stepName: 'Configuration changed',   severity: 'warn'  },
  };

  // Outcome vocabulary — drives signal coloring across all UI panels
  const OUTCOME_COLOR = {
    on_track:  '#1D9E75',
    resolved:  '#1D9E75',
    fulfilled: '#1D9E75',
    approved:  '#1D9E75',
    at_risk:   '#EF9F27',
    submitted: '#EF9F27',
    pending:   '#EF9F27',
    blocked:   '#E24B4A',
    rejected:  '#E24B4A',
    critical:  '#E24B4A',
  };

  const SEVERITY_COLOR = {
    info:     'rgba(255,255,255,.25)',
    warn:     '#EF9F27',
    critical: '#E24B4A',
  };

  // ── Identity resolution ───────────────────────────────────────────────────

  function _resolveActor() {
    // Chain: new platform global → compass IC → legacy resource ID → legacy user ID
    if (window.CURRENT_USER?.id) {
      return {
        actor_resource_id: window.CURRENT_USER.id,
        actor_name:        window.CURRENT_USER.name  || null,
        actor_role:        window.CURRENT_USER.role  || null,
      };
    }
    if (window._myResource?.id) {
      return {
        actor_resource_id: window._myResource.id,
        actor_name:        window._myResource.name   || null,
        actor_role:        null,
      };
    }
    if (window.CURRENT_USER_RESOURCE_ID) {
      return {
        actor_resource_id: window.CURRENT_USER_RESOURCE_ID,
        actor_name:        null,   // caller should pass name in opts.actorName
        actor_role:        null,
      };
    }
    if (window.STATE?.currentUserId) {
      return {
        actor_resource_id: window.STATE.currentUserId,
        actor_name:        null,
        actor_role:        null,
      };
    }
    return { actor_resource_id: null, actor_name: 'System', actor_role: 'system' };
  }

  // ── Core write ───────────────────────────────────────────────────────────

  /**
   * Write a CoC event.
   *
   * @param {string} typeKey       'event_class.event_type'  e.g. 'task.completed'
   * @param {string} entityId      UUID of the entity this event is about
   * @param {object} [opts]
   *   @param {string}  opts.entityType    override entity_type (default: typeKey's class)
   *   @param {string}  opts.projectId     project context UUID
   *   @param {string}  opts.instanceId    workflow instance UUID (cadence)
   *   @param {string}  opts.templateStepId  template step UUID (cadence)
   *   @param {string}  opts.notes         event_notes free text
   *   @param {string}  opts.stepName      override the default step_name label
   *   @param {string}  opts.outcome       'on_track'|'at_risk'|'blocked'|'resolved'|...
   *   @param {string}  opts.actorName     override resolved actor name
   *   @param {string}  opts.actorRole     override resolved actor role
   *   @param {string}  opts.actorResourceId  override resolved actor_resource_id.
   *                                          Use when the calling context has
   *                                          already translated users.id →
   *                                          resources.id (e.g. via the
   *                                          accord_user_to_resource() helper).
   *                                          Required pattern per Iron Rule 58
   *                                          until _resolveActor() is refactored.
   *   @param {object}  opts.meta          metadata JSONB payload (legacy fields, etc.)
   *   @param {boolean} opts.silent        if true, suppress optimistic cache update
   * @returns {Promise<object>}  the written row
   */
  async function write(typeKey, entityId, opts = {}) {
    if (!typeKey || !entityId) {
      console.error('[CoC] write() requires typeKey and entityId');
      return null;
    }

    const meta = EVENT_META[typeKey];
    if (!meta) {
      console.warn(`[CoC] Unknown event type "${typeKey}" — writing anyway`);
    }

    // CMD-A6: handle dotted-suffix event types (e.g. 'accord.digest.delivered').
    // The original split('.') assignment dropped the third segment. Split on the
    // FIRST '.' only so eventType retains everything after the class.
    const _firstDot = typeKey.indexOf('.');
    const eventClass = _firstDot >= 0 ? typeKey.slice(0, _firstDot) : typeKey;
    const eventType  = _firstDot >= 0 ? typeKey.slice(_firstDot + 1) : '';
    const actor = _resolveActor();
    // CMD-A6: caller can override the resolved actor_resource_id when the
    // calling context has already translated users.id → resources.id
    // (e.g. accord-digest.js using accord_user_to_resource() helper).
    if (opts.actorResourceId) {
      actor.actor_resource_id = opts.actorResourceId;
    }
    const now   = new Date().toISOString();

    // CMD-AEGIS-1.1: resolve firm_id at write time. Without a hardcoded
    // fallback, an unresolved firm_id would write a NULL row that either
    // RLS-rejects or pollutes audit data. Fail-fast here with a clear
    // diagnostic so callers see the problem immediately.
    const _firmId = (typeof window !== 'undefined' && window.FIRM_ID)
                 || ((typeof window !== 'undefined' && window.PHUD && window.PHUD.FIRM_ID))
                 || FIRM_ID
                 || null;
    if (!_firmId) {
      console.error('[CoC] write() aborted: firm_id unresolved. Caller should await Auth.ensureFirmId() before writing.', { typeKey, entityId });
      return null;
    }

    const row = {
      id:               crypto.randomUUID(),
      firm_id:          _firmId,

      // What
      event_class:      eventClass,
      event_type:       eventType,
      step_name:        opts.stepName   || meta?.stepName || typeKey,
      event_notes:      opts.notes      || null,
      severity:         meta?.severity  || 'info',

      // To what
      entity_type:      opts.entityType || eventClass,
      entity_id:        entityId,
      project_id:       opts.projectId       || null,
      instance_id:      opts.instanceId      || null,
      template_step_id: opts.templateStepId  || null,

      // Who
      actor_resource_id: actor.actor_resource_id,
      actor_name:        opts.actorName || actor.actor_name,
      actor_role:        opts.actorRole || actor.actor_role,

      // Signal
      outcome:          opts.outcome    || null,

      // Legacy metadata
      metadata:         opts.meta       || null,

      // Timestamps
      occurred_at:      opts.occurredAt || now,
      created_at:       now,
      updated_at:       now,
    };

    // Optimistic cache update — any CoC panel currently rendered will see this
    if (!opts.silent) {
      if (!window._cocCache) window._cocCache = {};
      const cacheKey = `${row.entity_type}:${entityId}`;
      if (window._cocCache[cacheKey]) {
        window._cocCache[cacheKey].unshift(row);
      }
      // Also update the legacy window._myCocEvents used by mw-core.js
      if (window._myCocEvents) {
        window._myCocEvents.unshift(row);
      }
    }

    // Persist
    try {
      if (!window.API) throw new Error('window.API not available');
      const [written] = await window.API.post('coc_events', row);
      return written || row;
    } catch (e) {
      console.error('[CoC] write failed:', e.message, row);
      // Rollback optimistic cache
      if (!opts.silent && window._cocCache) {
        const cacheKey = `${row.entity_type}:${entityId}`;
        if (window._cocCache[cacheKey]) {
          window._cocCache[cacheKey] = window._cocCache[cacheKey].filter(r => r.id !== row.id);
        }
      }
      return null;
    }
  }

  // ── Read ─────────────────────────────────────────────────────────────────

  /**
   * Read all CoC events for an entity, sorted newest first.
   * Uses an in-memory cache keyed by 'entity_type:entity_id'.
   *
   * @param {string} entityType   e.g. 'task' | 'workflow' | 'timesheet'
   * @param {string} entityId     UUID
   * @param {object} [opts]
   *   @param {boolean} opts.bust   force cache bust
   *   @param {number}  opts.limit  max rows (default 200)
   * @returns {Promise<Array>}
   */
  async function read(entityType, entityId, opts = {}) {
    if (!entityType || !entityId) return [];

    const cacheKey = `${entityType}:${entityId}`;
    if (!opts.bust && window._cocCache?.[cacheKey]) {
      return window._cocCache[cacheKey];
    }

    try {
      const limit = opts.limit || 200;
      const rows = await window.API.get(
        `coc_events?entity_type=eq.${entityType}&entity_id=eq.${entityId}` +
        `&order=occurred_at.desc&limit=${limit}&select=*`
      );
      const result = Array.isArray(rows) ? rows : [];
      if (!window._cocCache) window._cocCache = {};
      window._cocCache[cacheKey] = result;
      return result;
    } catch (e) {
      console.error('[CoC] read failed:', e.message);
      return [];
    }
  }

  /**
   * Read CoC events for multiple entity IDs in a single query.
   * Used by mw-core.js to load a user's full event history.
   *
   * @param {string[]} entityIds  array of UUIDs
   * @param {object}   [opts]
   *   @param {string}  opts.entityType   filter to one entity type
   *   @param {string}  opts.actorResourceId  filter to one actor
   *   @param {number}  opts.limit
   * @returns {Promise<Array>}
   */
  async function readMany(entityIds, opts = {}) {
    // Support two modes:
    //   1. entity-based: entityIds is non-empty array
    //   2. actor-based:  entityIds is empty, opts.actorResourceId is set
    //
    // Guard: API may not be initialized yet on early page-load calls.
    // Return [] silently — mw-core falls back to direct API.get on the same tick.
    if (!window.API?.get) return [];

    try {
      const limit = opts.limit || 500;
      let qs;
      if (entityIds?.length) {
        qs = `coc_events?entity_id=in.(${entityIds.join(',')})&order=occurred_at.desc&limit=${limit}&select=*`;
        if (opts.entityType)       qs += `&entity_type=eq.${opts.entityType}`;
        if (opts.actorResourceId)  qs += `&actor_resource_id=eq.${opts.actorResourceId}`;
      } else if (opts.actorResourceId) {
        qs = `coc_events?actor_resource_id=eq.${opts.actorResourceId}&order=occurred_at.desc&limit=${limit}&select=*`;
      } else {
        return [];
      }
      const rows = await window.API.get(qs);
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('[CoC] readMany failed:', e.message);
      return [];
    }
  }

  /**
   * Read CoC events by project (for PM portfolio views).
   *
   * @param {string} projectId
   * @param {object} [opts]
   * @returns {Promise<Array>}
   */
  async function readByProject(projectId, opts = {}) {
    if (!projectId) return [];
    try {
      const limit = opts.limit || 500;
      const rows = await window.API.get(
        `coc_events?project_id=eq.${projectId}&order=occurred_at.desc&limit=${limit}&select=*`
      );
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.error('[CoC] readByProject failed:', e.message);
      return [];
    }
  }

  // ── Cache management ──────────────────────────────────────────────────────

  /** Bust the cache for a specific entity (call after bulk operations). */
  function bust(entityType, entityId) {
    if (window._cocCache) {
      delete window._cocCache[`${entityType}:${entityId}`];
    }
  }

  /** Bust the entire CoC cache. */
  function bustAll() {
    window._cocCache = {};
  }

  // ── Render: inline timeline widget ───────────────────────────────────────
  //
  // Renders a full CoC timeline into any container element.
  // This is the canonical display component — every module that shows
  // a CoC panel MUST use CoC.render() rather than rolling its own HTML.

  /**
   * @param {string}      entityType
   * @param {string}      entityId
   * @param {HTMLElement} containerEl
   * @param {object}      [opts]
   *   @param {boolean}  opts.compact   condensed single-line rows
   *   @param {number}   opts.limit
   *   @param {boolean}  opts.loading   show skeleton while fetching
   */
  async function render(entityType, entityId, containerEl, opts = {}) {
    if (!containerEl) return;

    if (opts.loading !== false) {
      containerEl.innerHTML = _skeletonHtml();
    }

    const events = await read(entityType, entityId, { limit: opts.limit });
    containerEl.innerHTML = events.length
      ? _timelineHtml(events, opts)
      : _emptyHtml();
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function _skeletonHtml() {
    return `
      <div style="padding:12px 0">
        ${[1,2,3].map(() => `
          <div style="display:flex;gap:10px;margin-bottom:14px;opacity:.35">
            <div style="width:8px;height:8px;border-radius:50%;background:var(--border,#30363d);margin-top:4px;flex-shrink:0"></div>
            <div style="flex:1">
              <div style="height:10px;background:var(--border,#30363d);width:40%;margin-bottom:5px"></div>
              <div style="height:9px;background:var(--border,#30363d);width:70%"></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function _emptyHtml() {
    return `<div style="font-family:var(--font-mono,monospace);font-size:11px;color:var(--text3,#6e7681);
                        line-height:1.7;padding:4px 0">
              No CoC events yet.<br>Actions taken on this record will appear here.
            </div>`;
  }

  function _timelineHtml(events, opts = {}) {
    const E = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const fmtTs = iso => {
      if (!iso) return '';
      try {
        return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      } catch { return iso; }
    };

    return events.map((e, i) => {
      const dotColor  = (e.outcome && OUTCOME_COLOR[e.outcome])
                      || (e.severity && SEVERITY_COLOR[e.severity])
                      || 'rgba(255,255,255,.25)';
      const isLast    = i === events.length - 1;
      const label     = e.step_name || (e.event_class + '.' + e.event_type).replace(/_/g, ' ');
      const notes     = e.event_notes || '';
      const ts        = fmtTs(e.occurred_at || e.created_at);
      const actor     = e.actor_name || '';
      const hasOutcome = e.outcome && OUTCOME_COLOR[e.outcome];
      const outcomeLbl = e.outcome ? e.outcome.replace(/_/g, ' ') : '';

      if (opts.compact) {
        return `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,.04)">
            <div style="width:6px;height:6px;border-radius:50%;background:${dotColor};margin-top:4px;flex-shrink:0"></div>
            <div style="flex:1;min-width:0">
              <span style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:600;color:${dotColor}">${E(label)}</span>
              ${actor ? `<span style="font-family:var(--font-mono,monospace);font-size:10px;color:rgba(255,255,255,.3);margin-left:6px">${E(actor)}</span>` : ''}
            </div>
            <div style="font-family:var(--font-mono,monospace);font-size:10px;color:rgba(255,255,255,.22);white-space:nowrap;flex-shrink:0">${E(ts)}</div>
          </div>`;
      }

      return `
        <div style="display:flex;gap:10px;margin-bottom:12px">
          <div style="display:flex;flex-direction:column;align-items:center;width:14px;flex-shrink:0">
            <div style="width:8px;height:8px;border-radius:50%;background:${dotColor};margin-top:3px"></div>
            ${!isLast ? `<div style="width:1px;flex:1;min-height:10px;background:rgba(255,255,255,.07);margin-top:3px"></div>` : ''}
          </div>
          <div style="flex:1;min-width:0;padding-bottom:${isLast ? 0 : 4}px">
            <div style="font-family:var(--font-mono,monospace);font-size:11px;font-weight:700;color:${dotColor}">${E(label)}</div>
            ${hasOutcome ? `
              <div style="display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:2px 8px;
                           border-radius:10px;border:1px solid ${dotColor}44">
                <div style="width:5px;height:5px;border-radius:50%;background:${dotColor}"></div>
                <span style="font-family:var(--font-mono,monospace);font-size:10px;font-weight:600;color:${dotColor}">${E(outcomeLbl)}</span>
              </div>` : ''}
            ${notes ? `<div style="font-family:var(--font-mono,monospace);font-size:11px;color:rgba(240,246,255,.7);
                                   margin-top:3px;padding:3px 7px;background:rgba(255,255,255,.03);
                                   border-left:2px solid ${dotColor};line-height:1.45;word-break:break-word">${E(notes.slice(0, 300))}</div>` : ''}
            ${actor ? `<div style="font-family:var(--font-mono,monospace);font-size:10px;color:rgba(255,255,255,.28);margin-top:2px">By ${E(actor)}</div>` : ''}
            ${ts ? `<div style="font-family:var(--font-mono,monospace);font-size:10px;color:rgba(255,255,255,.2);margin-top:2px">${E(ts)}</div>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // ── Legacy adapter: map old direct API.post shapes to CoC.write() ─────────
  //
  // These allow legacy modules (projects.html, project-detail.html) to
  // continue working during migration without touching their call sites.
  // Each adapter wraps an old-style payload and routes through write().

  const legacy = {

    /**
     * Adapter for exception_annotations writes.
     * Called as: CoC.legacy.exceptionAnnotation(taskId, actionType, notes, projectId?)
     */
    exceptionAnnotation(entityId, actionType, notes, projectId) {
      // Map action_type → new event vocabulary
      const typeMap = {
        intervention:   'exception.intervention',
        note:           'exception.note',
        resolution:     'exception.resolution',
        acknowledgment: 'exception.acknowledgment',
        action_item:    'exception.action_item',
      };
      const typeKey = typeMap[actionType] || 'exception.note';
      return write(typeKey, entityId, {
        entityType: 'task',
        notes,
        projectId: projectId || null,
        meta: { action_type: actionType },  // preserve original for audit trail
      });
    },

    /**
     * Adapter for audit_log writes.
     * Called as: CoC.legacy.auditLog(table, recordId, action, before, after)
     */
    auditLog(table, recordId, action, before, after) {
      return write('audit.field_change', recordId, {
        entityType: table,
        notes: action,
        meta: {
          affected_table: table,
          before_value:   before ? JSON.stringify(before) : null,
          after_value:    after  ? JSON.stringify(after)  : null,
        },
      });
    },

    /**
     * Adapter for task_journal writes.
     * Called as: CoC.legacy.taskJournal(taskId, projectId, { accomplishment, hours, pct, blockers })
     */
    taskJournal(taskId, projectId, entry) {
      return write('progress.update', taskId, {
        entityType: 'task',
        projectId,
        notes: entry.accomplishment || null,
        outcome: entry.blockers ? 'at_risk' : 'on_track',
        meta: {
          hours_spent:       entry.hours        || null,
          pct_complete:      entry.pct          || null,
          accomplishment:    entry.accomplishment || null,
          blockers:          entry.blockers      || null,
        },
      });
    },

    /**
     * Adapter for resource_request_events writes.
     */
    resourceRequestEvent(requestId, eventType, notes, actorRole) {
      const typeMap = {
        submitted: 'request.submitted',
        approved:  'request.approved',
        rejected:  'request.rejected',
        fulfilled: 'request.fulfilled',
        withdrawn: 'request.withdrawn',
      };
      return write(typeMap[eventType] || 'request.submitted', requestId, {
        entityType: 'resource_request',
        notes,
        actorRole,
        meta: { request_id: requestId, event_type: eventType },
      });
    },
  };

  // ── Expose public API ─────────────────────────────────────────────────────

  window.CoC = {
    write,
    read,
    readMany,
    readByProject,
    render,
    bust,
    bustAll,
    legacy,

    // Expose vocabularies for use in UI modules
    EVENT_META,
    OUTCOME_COLOR,
    SEVERITY_COLOR,

    // Expose renderers for modules that pre-fetch events and render directly
    // (e.g. mw-core.js which merges entity + actor events before rendering)
    _timelineHtml,
    _emptyHtml,
    _skeletonHtml,
  };

  console.log('[CoC] Platform Chain of Custody service loaded.');

})();