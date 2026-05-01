/**
 * SundayTally AI Onboarding Questions
 * 
 * This module defines the question flow that determines a church's grid configuration.
 * Questions are asked in a specific order to detect patterns and build the config.
 */

export interface QuestionnaireAnswer {
  questionId: string;
  answer: any;
}

export interface Question {
  id: string;
  type: 'single-choice' | 'multi-choice' | 'text' | 'number' | 'yes-no';
  question: string;
  description?: string;
  options?: QuestionOption[];
  conditionalOn?: ConditionalRule;
}

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConditionalRule {
  questionId: string;
  answerValue: any;
}

// ══════════════════════════════════════════════════════════════════════════════
// QUESTION FLOW
// ══════════════════════════════════════════════════════════════════════════════

export const onboardingQuestions: Question[] = [
  
  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 1: SERVICE STRUCTURE PATTERN
  // ────────────────────────────────────────────────────────────────────────────
  
  {
    id: 'service_structure',
    type: 'single-choice',
    question: 'How does your Sunday morning service work?',
    description: 'This helps us understand whether you run one unified gathering or multiple concurrent experiences.',
    options: [
      {
        value: 'unified',
        label: 'One unified service',
        description: 'Everyone gathers in the same space or adjacent areas. Main adults, kids, and youth are all part of the same service event.'
      },
      {
        value: 'concurrent_experiences',
        label: 'Multiple concurrent experiences',
        description: 'While adults are in the sanctuary, kids are in a separate children\'s ministry room with their own programming and team. These are separate operational units happening at the same time.'
      },
      {
        value: 'multiple_time_slots',
        label: 'Multiple time slots (9am, 11am, etc.)',
        description: 'We run the same service multiple times at different hours. Each time slot is a separate instance.'
      }
    ]
  },

  {
    id: 'concurrent_experiences_detail',
    type: 'multi-choice',
    question: 'Which concurrent experiences do you run during Sunday services?',
    description: 'Select all that apply. Each experience will get its own column group in the History grid.',
    conditionalOn: { questionId: 'service_structure', answerValue: 'concurrent_experiences' },
    options: [
      { value: 'main_adult', label: 'Main Adult Service (sanctuary/worship center)' },
      { value: 'kids', label: 'Kids Ministry (children\'s wing/classrooms)' },
      { value: 'youth', label: 'Youth Ministry (youth room/separate space)' },
      { value: 'other', label: 'Other (we\'ll ask you to specify)' }
    ]
  },

  {
    id: 'time_slots',
    type: 'multi-choice',
    question: 'What time slots do you run services?',
    description: 'Select all that apply. Each time slot will be tracked separately.',
    conditionalOn: { questionId: 'service_structure', answerValue: 'multiple_time_slots' },
    options: [
      { value: '8:00am', label: '8:00 AM' },
      { value: '9:00am', label: '9:00 AM' },
      { value: '10:00am', label: '10:00 AM' },
      { value: '11:00am', label: '11:00 AM' },
      { value: '5:00pm', label: '5:00 PM' },
      { value: '6:00pm', label: '6:00 PM' },
      { value: 'custom', label: 'Custom times (we\'ll ask you to specify)' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 2: ATTENDANCE TRACKING
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'attendance_scope',
    type: 'single-choice',
    question: 'How do you track attendance?',
    description: 'Do you count attendance per service, or do you track a weekly total?',
    options: [
      {
        value: 'per_service',
        label: 'Per service',
        description: 'We count attendance separately for each service time (9am gets one count, 11am gets another).'
      },
      {
        value: 'weekly_total',
        label: 'Weekly total',
        description: 'We track one total attendance number for the entire week, regardless of how many services we run.'
      }
    ]
  },

  {
    id: 'attendance_age_groups',
    type: 'multi-choice',
    question: 'Which age groups do you track for attendance?',
    description: 'Select all that apply.',
    options: [
      { value: 'main_adult', label: 'Main/Adult Attendance' },
      { value: 'kids', label: 'Kids Attendance' },
      { value: 'youth', label: 'Youth Attendance' }
    ]
  },

  {
    id: 'age_groups_are_experiences',
    type: 'yes-no',
    question: 'Are kids and youth separate experiences with their own teams?',
    description: 'Do kids and youth have their own volunteer teams, their own rooms, and their own separate programming? Or are they demographic slices of one unified service?',
    conditionalOn: { questionId: 'service_structure', answerValue: 'unified' }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 3: VOLUNTEER TRACKING
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'volunteers_scope',
    type: 'single-choice',
    question: 'How do you track volunteers?',
    options: [
      {
        value: 'weekly_churchwide',
        label: 'Weekly church-wide total',
        description: 'We track one volunteer count for the entire week across all services.'
      },
      {
        value: 'per_service',
        label: 'Per service',
        description: 'We count volunteers separately for each service time.'
      },
      {
        value: 'per_experience',
        label: 'Per experience',
        description: 'We count volunteers separately for each experience (adult service volunteers vs kids ministry volunteers).'
      }
    ]
  },

  {
    id: 'volunteer_roles',
    type: 'yes-no',
    question: 'Do you track volunteer roles (Tech, Greeting, Hospitality, etc.) separately?',
    description: 'If yes, we\'ll add collapsible role columns so you can break down volunteer counts by role.'
  },

  {
    id: 'volunteer_role_list',
    type: 'text',
    question: 'What volunteer roles do you track?',
    description: 'Enter role names separated by commas (e.g. "Tech, Hospitality, Greeting, Parking")',
    conditionalOn: { questionId: 'volunteer_roles', answerValue: 'yes' }
  },

  {
    id: 'volunteer_roles_per_experience',
    type: 'yes-no',
    question: 'Does each experience have its own set of volunteer roles?',
    description: 'For example, does the Kids experience have "Teachers, Helpers, Check-In" while the Adult experience has "Tech, Hospitality, Greeting"?',
    conditionalOn: { questionId: 'volunteers_scope', answerValue: 'per_experience' }
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 4: GIVING TRACKING
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'giving_scope',
    type: 'single-choice',
    question: 'How do you track giving?',
    options: [
      {
        value: 'weekly',
        label: 'Weekly total',
        description: 'We track one giving total for the entire week (plate + online combined).'
      },
      {
        value: 'per_service',
        label: 'Per service',
        description: 'We count offering separately for each service time.'
      }
    ]
  },

  {
    id: 'giving_sources',
    type: 'multi-choice',
    question: 'Which giving sources do you track?',
    description: 'Select all that apply.',
    options: [
      { value: 'plate', label: 'Plate/Cash Offering' },
      { value: 'online', label: 'Online Giving' },
      { value: 'check', label: 'Checks' },
      { value: 'other', label: 'Other' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 5: STATS & DECISIONS
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'stats_scope',
    type: 'single-choice',
    question: 'How do you track stats like guests, decisions, and baptisms?',
    options: [
      {
        value: 'per_service',
        label: 'Per service',
        description: 'We count these separately for each service time.'
      },
      {
        value: 'weekly',
        label: 'Weekly total',
        description: 'We track one total for the week.'
      }
    ]
  },

  {
    id: 'stats_categories',
    type: 'multi-choice',
    question: 'Which stats do you track?',
    description: 'Select all that apply.',
    options: [
      { value: 'guests', label: 'First-Time Guests' },
      { value: 'decisions', label: 'Decisions/Salvations' },
      { value: 'baptisms', label: 'Baptisms' },
      { value: 'hands_raised', label: 'Hands Raised' },
      { value: 'prayer_requests', label: 'Prayer Requests' },
      { value: 'other', label: 'Other (we\'ll ask you to specify)' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 6: FACILITIES & WEEKLY METRICS
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'facilities_metrics',
    type: 'multi-choice',
    question: 'Do you track any of these facilities/logistics metrics?',
    description: 'These are typically tracked weekly, not per-service. Select all that apply.',
    options: [
      { value: 'rooms_open', label: 'Rooms Open' },
      { value: 'cars_parked', label: 'Cars Parked' },
      { value: 'buses_run', label: 'Buses Run' },
      { value: 'other', label: 'Other' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 7: MONTHLY METRICS
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'monthly_metrics',
    type: 'multi-choice',
    question: 'Do you track any monthly metrics?',
    description: 'These are entered once per month. Select all that apply.',
    options: [
      { value: 'lifegroups_active', label: 'LifeGroups/Small Groups Active' },
      { value: 'first_time_families', label: 'First-Time Families' },
      { value: 'members_added', label: 'New Members Added' },
      { value: 'other', label: 'Other' }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────────
  // SECTION 8: MIDWEEK SERVICES
  // ────────────────────────────────────────────────────────────────────────────

  {
    id: 'midweek_services',
    type: 'yes-no',
    question: 'Do you run any midweek services (Wednesday, etc.)?'
  },

  {
    id: 'midweek_details',
    type: 'multi-choice',
    question: 'Which midweek services do you run?',
    description: 'Select all that apply.',
    conditionalOn: { questionId: 'midweek_services', answerValue: 'yes' },
    options: [
      { value: 'wednesday_youth', label: 'Wednesday Youth Service' },
      { value: 'wednesday_adult', label: 'Wednesday Adult Service/Bible Study' },
      { value: 'other', label: 'Other (we\'ll ask you to specify)' }
    ]
  }
];

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG BUILDER FROM ANSWERS
// ══════════════════════════════════════════════════════════════════════════════

import type { GridConfig, ColumnGroup, DataColumn } from './grid-config-schema';

/**
 * Builds a GridConfig from questionnaire answers
 */
export function buildConfigFromAnswers(answers: Record<string, any>): GridConfig {
  const config: GridConfig = {
    churchId: 'generated',
    version: '1.0',
    columns: [],
    serviceTemplates: [],
    monthlyMetrics: [],
    weeklyMetrics: [],
    serviceMetrics: []
  };

  // Determine grid pattern from service_structure
  const serviceStructure = answers.service_structure;

  if (serviceStructure === 'concurrent_experiences') {
    buildExperienceGroupedColumns(config, answers);
  } else if (serviceStructure === 'multiple_time_slots') {
    buildServiceTimeGroupedColumns(config, answers);
  } else {
    buildMetricGroupedColumns(config, answers);
  }

  // Build service templates
  buildServiceTemplates(config, answers);

  // Build metric definitions
  buildMetricDefinitions(config, answers);

  // Validate and auto-fix
  const { validateConfig } = require('./grid-config-schema');
  const errors = validateConfig(config);
  
  if (errors.length > 0) {
    console.warn('Config validation found issues:', errors);
    
    // Auto-apply fixes
    errors.forEach(error => {
      if (error.fix) {
        error.fix();
      }
    });
  }

  return config;
}

/**
 * V4 Pattern: Experience-Grouped Columns
 */
function buildExperienceGroupedColumns(config: GridConfig, answers: Record<string, any>) {
  const experiences = answers.concurrent_experiences_detail || [];
  
  for (const exp of experiences) {
    const group: ColumnGroup = {
      type: 'group',
      id: `${exp}_exp`,
      label: experienceLabel(exp),
      scope: 'SV',
      serviceFilter: [], // populated later in buildServiceTemplates
      children: []
    };

    // Add attendance column
    group.children.push({
      type: 'data',
      id: `${exp}_attend`,
      label: 'Attendance',
      scope: 'SV',
      editable: true,
      dataType: 'number'
    });

    // Add volunteer columns if tracked per-experience
    if (answers.volunteers_scope === 'per_experience') {
      const roles = parseRoleList(answers.volunteer_role_list || '');
      
      group.children.push({
        type: 'data',
        id: `${exp}_vol_total`,
        label: 'Vol Total',
        scope: 'SV',
        editable: false,
        dataType: 'number',
        computedFrom: roles.map(r => `${exp}_vol_${r.id}`)
      });

      if (answers.volunteer_roles === 'yes') {
        const rolesGroup: ColumnGroup = {
          type: 'group',
          id: `${exp}_vol_roles`,
          label: 'Vol Roles',
          scope: 'SV',
          collapsible: true,
          defaultCollapsed: true,
          children: roles.map(r => ({
            type: 'data',
            id: `${exp}_vol_${r.id}`,
            label: r.name,
            scope: 'SV',
            editable: true,
            dataType: 'number'
          }))
        };
        group.children.push(rolesGroup);
      }
    }

    config.columns.push(group);
  }

  // Add Service Stats group (cross-experience)
  if (answers.stats_scope === 'per_service') {
    const statsGroup: ColumnGroup = {
      type: 'group',
      id: 'service_stats',
      label: 'Service Stats',
      scope: 'SV',
      children: buildStatsColumns(answers)
    };
    config.columns.push(statsGroup);
  }

  // Add Weekly Stats group
  const weeklyGroup: ColumnGroup = {
    type: 'group',
    id: 'weekly_stats',
    label: 'Weekly Stats',
    scope: 'WK',
    children: buildWeeklyColumns(answers)
  };
  config.columns.push(weeklyGroup);
}

/**
 * Third Pattern: Service-Time Grouped Columns
 */
function buildServiceTimeGroupedColumns(config: GridConfig, answers: Record<string, any>) {
  const timeSlots = answers.time_slots || [];
  
  for (const slot of timeSlots) {
    if (slot === 'custom') continue; // handle separately
    
    const group: ColumnGroup = {
      type: 'group',
      id: `svc_${slot.replace(':', '')}`,
      label: `${slot} Service`,
      scope: 'SV',
      serviceFilter: [`sunday_${slot.replace(':', '')}`],
      children: []
    };

    // Add age group columns
    const ageGroups = answers.attendance_age_groups || [];
    for (const age of ageGroups) {
      group.children.push({
        type: 'data',
        id: `svc_${slot.replace(':', '')}_${age}`,
        label: age === 'main_adult' ? 'Main' : age.charAt(0).toUpperCase() + age.slice(1),
        scope: 'SV',
        editable: true,
        dataType: 'number'
      });
    }

    // Add giving if per-service
    if (answers.giving_scope === 'per_service') {
      group.children.push({
        type: 'data',
        id: `svc_${slot.replace(':', '')}_giving`,
        label: 'Giving ($)',
        scope: 'SV',
        editable: true,
        dataType: 'currency'
      });
    }

    // Add stats if per-service
    if (answers.stats_scope === 'per_service') {
      const stats = answers.stats_categories || [];
      for (const stat of stats) {
        group.children.push({
          type: 'data',
          id: `svc_${slot.replace(':', '')}_${stat}`,
          label: statLabel(stat),
          scope: 'SV',
          editable: true,
          dataType: 'number'
        });
      }
    }

    config.columns.push(group);
  }

  // Add Weekly Totals group
  const weeklyGroup: ColumnGroup = {
    type: 'group',
    id: 'weekly_totals',
    label: 'Weekly Totals',
    scope: 'WK',
    children: buildWeeklyColumns(answers)
  };
  config.columns.push(weeklyGroup);
}

/**
 * V3 Pattern: Metric-Grouped Columns
 */
function buildMetricGroupedColumns(config: GridConfig, answers: Record<string, any>) {
  // Attendance group
  const ageGroups = answers.attendance_age_groups || [];
  if (ageGroups.length > 0) {
    const attendGroup: ColumnGroup = {
      type: 'group',
      id: 'attendance',
      label: 'Attendance',
      scope: 'SV',
      children: ageGroups.map((age: string) => ({
        type: 'data',
        id: `${age}_attend`,
        label: age === 'main_adult' ? 'Main' : age.charAt(0).toUpperCase() + age.slice(1),
        scope: 'SV',
        editable: true,
        dataType: 'number'
      }))
    };
    config.columns.push(attendGroup);
  }

  // Volunteers group (if per-service)
  if (answers.volunteers_scope === 'per_service') {
    const roles = parseRoleList(answers.volunteer_role_list || '');
    const volGroup: ColumnGroup = {
      type: 'group',
      id: 'volunteers',
      label: 'Volunteers',
      scope: 'SV',
      children: [
        {
          type: 'data',
          id: 'vol_total',
          label: 'Vol Total',
          scope: 'SV',
          editable: false,
          dataType: 'number',
          computedFrom: roles.map(r => `vol_${r.id}`)
        }
      ]
    };

    if (answers.volunteer_roles === 'yes') {
      const rolesGroup: ColumnGroup = {
        type: 'group',
        id: 'vol_roles',
        label: 'Roles',
        scope: 'SV',
        collapsible: true,
        defaultCollapsed: true,
        children: roles.map(r => ({
          type: 'data',
          id: `vol_${r.id}`,
          label: r.name,
          scope: 'SV',
          editable: true,
          dataType: 'number'
        }))
      };
      volGroup.children.push(rolesGroup);
    }

    config.columns.push(volGroup);
  }

  // Stats group
  if (answers.stats_scope === 'per_service') {
    const statsGroup: ColumnGroup = {
      type: 'group',
      id: 'stats',
      label: 'Stats & Decisions',
      scope: 'SV',
      children: buildStatsColumns(answers)
    };
    config.columns.push(statsGroup);
  }

  // Weekly metrics group
  const weeklyGroup: ColumnGroup = {
    type: 'group',
    id: 'weekly_metrics',
    label: 'Weekly Metrics',
    scope: 'WK',
    children: buildWeeklyColumns(answers)
  };
  config.columns.push(weeklyGroup);
}

function buildStatsColumns(answers: Record<string, any>): DataColumn[] {
  const stats = answers.stats_categories || [];
  return stats.map((stat: string) => ({
    type: 'data' as const,
    id: `stat_${stat}`,
    label: statLabel(stat),
    scope: 'SV' as const,
    editable: true,
    dataType: 'number' as const
  }));
}

function buildWeeklyColumns(answers: Record<string, any>): DataColumn[] {
  const columns: DataColumn[] = [];

  // Giving (if weekly)
  if (answers.giving_scope === 'weekly') {
    const sources = answers.giving_sources || [];
    for (const source of sources) {
      columns.push({
        type: 'data',
        id: `wk_${source}`,
        label: source === 'plate' ? 'Giving ($)' : `${source.charAt(0).toUpperCase() + source.slice(1)} ($)`,
        scope: 'WK',
        editable: true,
        dataType: 'currency'
      });
    }
  }

  // Volunteers (if weekly)
  if (answers.volunteers_scope === 'weekly_churchwide') {
    columns.push({
      type: 'data',
      id: 'wk_volunteers',
      label: 'Volunteers',
      scope: 'WK',
      editable: true,
      dataType: 'number'
    });
  }

  // Facilities
  const facilities = answers.facilities_metrics || [];
  for (const fac of facilities) {
    columns.push({
      type: 'data',
      id: `wk_${fac}`,
      label: fac.split('_').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      scope: 'WK',
      editable: true,
      dataType: 'number'
    });
  }

  return columns;
}

function buildServiceTemplates(config: GridConfig, answers: Record<string, any>) {
  // Build based on service_structure answer
  const structure = answers.service_structure;

  if (structure === 'multiple_time_slots') {
    const slots = answers.time_slots || [];
    for (const slot of slots) {
      if (slot === 'custom') continue;
      config.serviceTemplates.push({
        id: `sunday_${slot.replace(':', '')}`,
        displayName: `${slot} Service`,
        dayOfWeek: 0,
        timeSlot: slot,
        populatesColumnGroups: [`svc_${slot.replace(':', '')}`]
      });
    }
  } else {
    // Default Sunday services
    config.serviceTemplates.push({
      id: 'sunday_9am',
      displayName: '9:00 AM Service',
      dayOfWeek: 0,
      timeSlot: '09:00',
      populatesColumnGroups: config.columns
        .filter(c => c.type === 'group' && c.scope === 'SV' && c.id !== 'weekly_stats')
        .map(c => c.id)
    });
  }

  // Add midweek if configured
  if (answers.midweek_services === 'yes') {
    const midweek = answers.midweek_details || [];
    if (midweek.includes('wednesday_youth')) {
      config.serviceTemplates.push({
        id: 'wednesday_youth',
        displayName: 'Wednesday Youth',
        dayOfWeek: 3,
        timeSlot: '18:30',
        experienceType: 'youth',
        populatesColumnGroups: ['youth_exp', 'service_stats']
      });
    }
  }
}

function buildMetricDefinitions(config: GridConfig, answers: Record<string, any>) {
  // Weekly metrics
  if (answers.giving_scope === 'weekly') {
    config.weeklyMetrics.push({
      id: 'weekly_giving',
      label: 'Weekly Giving Total',
      scope: 'WK',
      columnId: 'wk_plate'
    });
  }

  if (answers.volunteers_scope === 'weekly_churchwide') {
    config.weeklyMetrics.push({
      id: 'weekly_volunteers',
      label: 'Weekly Volunteers Total',
      scope: 'WK',
      columnId: 'wk_volunteers'
    });
  }

  const facilities = answers.facilities_metrics || [];
  for (const fac of facilities) {
    config.weeklyMetrics.push({
      id: `weekly_${fac}`,
      label: fac.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      scope: 'WK',
      columnId: `wk_${fac}`
    });
  }

  // Monthly metrics
  const monthly = answers.monthly_metrics || [];
  for (const metric of monthly) {
    config.monthlyMetrics.push({
      id: `monthly_${metric}`,
      label: metric.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      scope: 'MO',
      columnId: `mo_${metric}`
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

function experienceLabel(exp: string): string {
  const labels: Record<string, string> = {
    main_adult: 'Main Adult Experience',
    kids: 'Kids Experience',
    youth: 'Youth Experience'
  };
  return labels[exp] || exp;
}

function statLabel(stat: string): string {
  const labels: Record<string, string> = {
    guests: 'Guests',
    decisions: 'Decisions',
    baptisms: 'Baptisms',
    hands_raised: 'Hands Raised',
    prayer_requests: 'Prayer Requests'
  };
  return labels[stat] || stat;
}

function parseRoleList(roleString: string): Array<{ id: string; name: string }> {
  return roleString.split(',').map(r => {
    const name = r.trim();
    const id = name.toLowerCase().replace(/\s+/g, '_');
    return { id, name };
  });
}
