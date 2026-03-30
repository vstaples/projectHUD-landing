// cdn-meeting.js — Cadence: meeting step rendering and start logic
// LOAD ORDER: 10th

async function renderCadMeetingStep(inst, step) {
  const el = document.getElementById('cad-meeting-' + step.id);
  if (!el) return;

  const coc = inst._stepInsts || [];
  const existing = coc.find(e =>
    e.event_type === 'meeting_created' && e.template_step_id === step.id);
  const meetingId = existing?.outcome_notes || null;

  if (!meetingId) {
    // Phase A — no meeting record yet
    MeetingCard.renderPreLaunch(step, el, () => cadStartMeeting(inst.id, step.id));
  } else {
    // Phase B — meeting exists: render the canonical card in editable mode
    el.dataset.mcEditable = 'true';
    el._mcResources = _resources_cad;
    await MeetingCard.render(meetingId, el, {
      editMinutesHref: `/meeting-minutes.html?meeting_id=${meetingId}`,
      editable:  true,
      resources: _resources_cad,
    });
  }
}

async function cadStartMeeting(instId, stepId) {
  const inst = _instances.find(i => i.id === instId);
  const step = inst?._tmplSteps?.find(s => s.id === stepId);

  const btn = document.getElementById('mc-start-btn-' + stepId);
  if (btn) { btn.textContent = 'Creating…'; btn.disabled = true; }

  try {
    const res = await API.post('meetings', {
      firm_id:                    FIRM_ID_CAD,
      title:                      step?.name || inst?.title || 'Meeting',
      meeting_type:               'ad_hoc',
      scheduled_date:             new Date().toISOString(),
      scheduled_duration_minutes: 60,
      status:                     'scheduled',
    });
    const meetingId = res?.[0]?.id;
    if (!meetingId) throw new Error('No meeting ID returned');

    // Seed agenda items from template step
    const agenda = step?._meetingAgenda || step?.meeting_agenda || [];
    if (agenda.length) {
      await Promise.all(agenda.map((title, i) =>
        API.post('meeting_agenda_items', {
          meeting_id:     meetingId,
          firm_id:        FIRM_ID_CAD,
          title,
          sequence_order: i + 1,
        }).catch(() => {})
      ));
    }

    // Write CoC event
    await API.post('workflow_step_instances', {
      instance_id:      instId,
      firm_id:          FIRM_ID_CAD,
      event_type:       'meeting_created',
      template_step_id: stepId,
      step_type:        'meeting',
      step_name:        step?.name || 'Meeting',
      outcome_notes:    meetingId,
      event_notes:      `Meeting created: ${step?.name || 'Meeting'}`,
      created_at:       new Date().toISOString(),
    });

    await _reloadInstance(instId);
    const freshInst = _instances.find(i => i.id === instId);
    const freshStep = freshInst?._tmplSteps?.find(s => s.id === stepId);
    if (freshInst && freshStep) renderCadMeetingStep(freshInst, freshStep);

  } catch(e) {
    cadToast('Failed to create meeting: ' + e.message, 'error');
    if (btn) { btn.textContent = '◉ Start Meeting'; btn.disabled = false; }
  }
}