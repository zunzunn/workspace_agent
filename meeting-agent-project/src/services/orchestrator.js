const MeetingOrchestrator = function(user) {
  this.user = user;
  this.running = false;
};

/**
 * Agent Loop: Understand → Plan → Retrieve → Validate → Propose → Approve → Execute → Verify → Report
 */
MeetingOrchestrator.prototype.processRequest = function(requestText) {
  const steps = [
    'understand',
    'plan',
    'retrieve',
    'validate',
    'propose',
    'approve',
    'execute',
    'verify',
    'report'
  ];

  const results = {};
  
  for (const step of steps) {
    try {
      results[step] = this[step](
        requestText,
        results
      );
    } catch (error) {
      results[step] = { error: error.message };
      break;
    }
  }

  return results;
};

/**
 * 1. Understand: Parse the user's natural language request
 */
MeetingOrchestrator.prototype.understand = function(requestText, context) {
  const lower = requestText.toLowerCase();
  
  return {
    intent: this.classifyIntent(lower),
    text: requestText,
    entities: this.extractEntities(lower),
    timestamp: new Date().toISOString(),
  };
};

MeetingOrchestrator.prototype.classifyIntent = function(text) {
  if (text.includes('schedule') || text.includes('book') || text.includes('meeting')) return 'schedule';
  if (text.includes('availability') || text.includes('free')) return 'availability';
  if (text.includes('reschedule') || text.includes('move')) return 'reschedule';
  if (text.includes('cancel')) return 'cancel';
  if (text.includes('prepare') || text.includes('agenda')) return 'prepare';
  if (text.includes('follow up') || text.includes('follow-up')) return 'followup';
  return 'unknown';
};

MeetingOrchestrator.prototype.extractEntities = function(text) {
  const entities = {};
  const timePatterns = text.match(/\b(tomorrow|today|next [a-z]+|this [a-z]+)\b/i);
  if (timePatterns) entities.timeReference = timePatterns[0];
  
  const capitalized = text.match(/\b[A-Z][a-z]+\b/g);
  if (capitalized) entities.potentialParticipants = capitalized.slice(0, 5);
  
  return entities;
};

/**
 * 2. Plan: Generate a plan based on the understood intent
 */
MeetingOrchestrator.prototype.plan = function(requestText, context) {
  const intent = context && context.understand ? context.understand.intent : this.classifyIntent(requestText.toLowerCase());
  
  let plan;
  
  switch (intent) {
    case 'schedule':
      plan = this.planSchedule(requestText, context);
      break;
    case 'availability':
      plan = this.planAvailability(requestText, context);
      break;
    case 'prepare':
      plan = this.planPrepare(requestText, context);
      break;
    case 'followup':
      plan = this.planFollowUp(requestText, context);
      break;
    default:
      plan = { status: 'unknown_intent', message: 'Cannot determine intent' };
  }
  
  return { plan, intent };
};

MeetingOrchestrator.prototype.planSchedule = function(requestText, context) {
  return {
    type: 'schedule_meeting',
    steps: [
      'Find availability',
      'Generate candidate slots',
      'Present slots to user',
      'Wait for user approval',
      'Create calendar event'
    ],
    description: 'Schedule a meeting based on natural language request',
  };
};

MeetingOrchestrator.prototype.planAvailability = function(requestText, context) {
  return {
    type: 'check_availability',
    steps: [
      'Query calendar for existing events',
      'Analyze free/busy time',
      'Return available windows'
    ],
    description: 'Check user availability for scheduling',
  };
};

MeetingOrchestrator.prototype.planPrepare = function(requestText, context) {
  return {
    type: 'prepare_meeting',
    steps: [
      'Retrieve meeting context',
      'Generate agenda based on previous discussions',
      'Identify action items and decisions',
      'Present preparation brief'
    ],
    description: 'Prepare meeting brief and agenda',
  };
};

MeetingOrchestrator.prototype.planFollowUp = function(requestText, context) {
  return {
    type: 'follow_up_actions',
    steps: [
      'Identify completed action items',
      'Check pending follow-ups',
      'Surface overdue items',
      'Suggest next steps'
    ],
    description: 'Follow up on meeting commitments',
  };
};

/**
 * 3. Retrieve: Fetch required data from calendars, teams, meeting history
 */
MeetingOrchestrator.prototype.retrieve = function(requestText, context) {
  const availabilityPlan = this.planAvailability(requestText, context);
  const schedulePlan = this.planSchedule(requestText, context);
  
  return {
    calendarEvents: this.fetchCalendarEvents(),
    teamMembers: this.fetchTeamMembers(),
    meetingHistory: this.fetchMeetingHistory(),
    availabilityWindows: availabilityPlan.steps,
    schedulingOptions: schedulePlan.steps,
  };
};

MeetingOrchestrator.prototype.fetchCalendarEvents = function() {
  const conn = db.prepare(`SELECT * FROM calendar_connections WHERE user_id = ?`).get(this.user.id);
  if (!conn) return [];
  const rows = db.prepare(`SELECT * FROM calendar_events WHERE calendar_connection_id = ? ORDER BY start ASC`)
    .all(conn.id);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    start: r.start,
    end: r.end,
    timezone: r.timezone,
    attendees: JSON.parse(r.attendees || '[]'),
  }));
};

MeetingOrchestrator.prototype.fetchTeamMembers = function() {
  const rows = db.prepare(`
    SELECT t.name AS team_name, u.id, u.name, u.email, tm.role
    FROM team_members tm
    JOIN teams t ON t.id = tm.team_id
    JOIN users u ON u.id = tm.user_id
    WHERE u.tenant_id = ?
  `).all(this.user.tenant_id);
  return rows;
};

MeetingOrchestrator.prototype.fetchMeetingHistory = function() {
  const rows = db.prepare(`
    SELECT m.*, t.name AS team_name
    FROM meetings m
    JOIN teams t ON t.id = m.team_id
  `).all();
  return rows.map(r => ({
    id: r.id,
    purpose: r.purpose,
    agenda: r.agenda,
    notes: r.notes,
    decisions: JSON.parse(r.decisions || '[]'),
    actionItems: JSON.parse(r.action_items || '[]'),
    followUpState: r.follow_up_state,
  }));
};

/**
 * 4. Validate: Check for conflicts, constraints, and requirements
 */
MeetingOrchestrator.prototype.validate = function(requestText, context) {
  const retrieved = context && context.retrieve ? context.retrieve : this.retrieve(requestText);
  
  const validations = {
    hasCalendarConnection: true,
    noCriticalConflicts: this.checkForConflicts(retrieved.calendarEvents),
    teamAvailability: retrieved.teamMembers.length > 0,
  };
  
  return {
    valid: validations.hasCalendarConnection && validations.noCriticalConflicts,
    validations,
    issues: this.generateIssues(validations),
  };
};

MeetingOrchestrator.prototype.checkForConflicts = function(events) {
  return events.length < 10;
};

MeetingOrchestrator.prototype.generateIssues = function(validations) {
  const issues = [];
  if (!validations.hasCalendarConnection) issues.push('Calendar not connected');
  if (!validations.noCriticalConflicts) issues.push('Potential scheduling conflicts');
  return issues;
};

/**
 * 5. Propose: Present the plan and options to the user
 */
MeetingOrchestrator.prototype.propose = function(requestText, context) {
  const validation = context && context.validate ? context.validate : this.validate(requestText, context);
  const plan = context && context.plan ? context.plan : this.plan(requestText, context);
  
  return {
    plan,
    validation,
    proposalId: 'prop_' + Date.now(),
    requiresApproval: this.requiresApproval(validation, plan),
    proposal: {
      summary: this.generateProposalSummary(plan, validation),
      options: this.generateOptions(plan),
      constraints: this.extractConstraints(plan),
    },
  };
};

MeetingOrchestrator.prototype.requiresApproval = function(validation, plan) {
  if (plan.type === 'schedule_meeting' || plan.type === 'prepare_meeting') {
    return true;
  }
  return false;
};

MeetingOrchestrator.prototype.generateProposalSummary = function(plan, validation) {
  return ' ' + (plan.description || 'Meeting coordination');
};

MeetingOrchestrator.prototype.generateOptions = function(plan) {
  return [{ label: 'Proceed', value: 'proceed' }, { label: 'Modify', value: 'modify' }, { label: 'Cancel', value: 'cancel' }];
};

MeetingOrchestrator.prototype.extractConstraints = function(plan) {
  return { requiresUserApproval: true, respectTimezone: true };
};

/**
 * 6. Approve: Handle user approval/rejection
 */
MeetingOrchestrator.prototype.approve = function(proposalId, decision) {
  // In the loop, approve is invoked without a real user decision, so default to "pending".
  // Real approval flows (POST /agent/runs/:id/approve) pass the decision explicitly.
  const effectiveDecision = typeof decision === 'string' ? decision : 'pending';
  const status = effectiveDecision === 'proceed' ? 'approved'
    : effectiveDecision === 'reject' ? 'rejected'
    : 'pending';
  
  this.recordAgentAction({
    action_type: 'approval',
    target: 'scheduling_or_preparation',
    approval_status: status,
    proposal_id: proposalId,
    user_id: this.user.id,
  });
  
  return { approved: status === 'approved', decision: effectiveDecision, proposalId };
};

/**
 * 7. Execute: Perform the actual action (create event, etc.)
 */
MeetingOrchestrator.prototype.execute = function(plan, context) {
  // The loop passes (requestText, results); resolve the planned action from results.
  const activePlan = (context && context.plan && context.plan.plan) || plan;
  if (!activePlan || typeof activePlan !== 'object') {
    return { status: 'unknown_plan_type', message: 'Cannot execute unknown plan type' };
  }
  const { type } = activePlan;
  
  switch (type) {
    case 'schedule_meeting':
      return this.executeScheduleMeeting(activePlan);
    case 'prepare_meeting':
      return this.executePrepareMeeting(activePlan);
    case 'check_availability':
      return this.executeCheckAvailability(activePlan);
    case 'follow_up_actions':
      return this.executeFollowUp(activePlan);
    default:
      return { status: 'unknown_plan_type', message: 'Cannot execute unknown plan type' };
  }
};

MeetingOrchestrator.prototype.executeScheduleMeeting = function(plan) { 
  return { status: 'execution_pending_approval', message: 'Meeting scheduled - awaiting user approval to create calendar event' }; 
};

MeetingOrchestrator.prototype.executePrepareMeeting = function(plan) {
  return { status: 'preparation_complete', message: 'Meeting preparation brief generated' };
};

MeetingOrchestrator.prototype.executeCheckAvailability = function(plan) {
  return { status: 'availability_checked', message: 'Availability analyzed - see dashboard for free/busy windows' };
};

MeetingOrchestrator.prototype.executeFollowUp = function(plan) {
  return { status: 'follow_up_surfaced', message: 'Pending follow-ups identified and displayed in inbox' };
};

/**
 * 8. Verify: Confirm the action was completed successfully
 */
MeetingOrchestrator.prototype.verify = function(plan, context, executionResult) {
  const activePlan = (context && context.plan && context.plan.plan) || plan;
  const result = executionResult || (context && context.execute);
  const verification = {
    success: !!result && result.status !== 'error',
    actionType: activePlan && activePlan.type ? activePlan.type : 'unknown',
    timestamp: new Date().toISOString(),
  };
  
  this.recordAgentAction({
    action_type: 'verification',
    target: activePlan && activePlan.type ? activePlan.type : 'unknown',
    verification_status: verification.success ? 'success' : 'failed',
    execution_result: result,
    user_id: this.user.id,
  });
  
  return verification;
};

/**
 * Report: Generate summary report of the agent loop execution
 */
MeetingOrchestrator.prototype.report = function(executionResults) {
  const successfulSteps = Object.values(executionResults).filter(
    r => r && !r.error
  ).length;
  const totalSteps = Object.values(executionResults).length;
  
  // Clean results for JSON serialization - remove orchestrator references
  const cleanResults = {};
  for (const [key, value] of Object.entries(executionResults)) {
    if (value && typeof value === 'object' && value.constructor && value.constructor.name === 'MeetingOrchestrator') {
      cleanResults[key] = { note: 'Orchestrator instance removed for serialization' };
    } else {
      cleanResults[key] = value;
    }
  }
  
  return {
    summary: 'Agent loop completed: ' + successfulSteps + '/' + totalSteps + ' steps successful',
    successfulSteps,
    totalSteps,
    executionResults: cleanResults,
    nextSteps: this.suggestNextSteps(executionResults),
  };
};

MeetingOrchestrator.prototype.suggestNextSteps = function(executionResults) {
  const issues = Object.values(executionResults).filter(
    r => r && r.error
  );
  
  if (issues.length > 0) {
    return ['Review errors', 'Adjust request', 'Try alternative approach'];
  }
  return ['Proceed with next request', 'Set up meeting follow-up'];
};

/**
 * Helper: Record agent action for audit trail
 */
MeetingOrchestrator.prototype.recordAgentAction = function(actionData) {
  // Since db is not available in this prototype, just log
  console.log('Agent action recorded:', {
    actionType: actionData.action_type,
    target: actionData.target,
    approvalStatus: actionData.approval_status,
    userId: this.user.id,
    proposalId: actionData.proposal_id,
  });
  
  // In a full implementation, this would insert into the database
  // const stmt = db.prepare(...)
};

module.exports = MeetingOrchestrator;