/**
 * Zustand Store — Three Departments Dashboard State Management
 * HTTP 5s polling, no WebSocket
 */

import { create } from 'zustand';
import i18n from './i18n';
import {
  api,
  type Task,
  type LiveStatus,
  type AgentConfig,
  type OfficialsData,
  type AgentsStatusData,
  type MorningBrief,
  type SubConfig,
  type ChangeLogEntry,
} from './api';

// ── Org Mapping (backend sends Chinese names) ──

export const ORG_TO_ID: Record<string, string> = {
  '皇上': 'emperor', '太子': 'crownPrince', '中书省': 'zhongshu', '门下省': 'menxia',
  '尚书省': 'shangshu', '六部': 'sixDepts', '礼部': 'libu', '户部': 'hubu',
  '兵部': 'bingbu', '刑部': 'xingbu', '工部': 'gongbu', '吏部': 'libu_hr',
  '钦天监': 'zaochao', '回奏': 'memorial',
};

export const ID_TO_ORG: Record<string, string> = {};
for (const [k, v] of Object.entries(ORG_TO_ID)) ID_TO_ORG[v] = k;

/** Translate a backend org name (Chinese) to the current locale display name */
export function tOrg(org: string): string {
  const id = ORG_TO_ID[org];
  return id ? i18n.t(`depts.${id}`) : org;
}

// ── Pipeline Definition (PIPE) ──

export const PIPE = [
  { key: 'Inbox',    dept: 'emperor',      icon: '👑', action: 'decree' },
  { key: 'Taizi',    dept: 'crownPrince',  icon: '🤴', action: 'triage' },
  { key: 'Zhongshu', dept: 'zhongshu',     icon: '📜', action: 'draft' },
  { key: 'Menxia',   dept: 'menxia',       icon: '🔍', action: 'review' },
  { key: 'Assigned', dept: 'shangshu',     icon: '📮', action: 'dispatch' },
  { key: 'Doing',    dept: 'sixDepts',     icon: '⚙️', action: 'execute' },
  { key: 'Review',   dept: 'shangshu',     icon: '🔎', action: 'summarize' },
  { key: 'Done',     dept: 'memorial',     icon: '✅', action: 'complete' },
] as const;

export const PIPE_STATE_IDX: Record<string, number> = {
  Inbox: 0, Pending: 0, Taizi: 1, Zhongshu: 2, Menxia: 3,
  Assigned: 4, Doing: 5, Review: 6, Done: 7, Blocked: 5, Cancelled: 5, Next: 4,
};

export const DEPT_COLOR: Record<string, string> = {
  crownPrince: '#e8a040', zhongshu: '#a07aff', menxia: '#6a9eff', shangshu: '#6aef9a',
  libu: '#f5c842', hubu: '#ff9a6a', bingbu: '#ff5270', xingbu: '#cc4444',
  gongbu: '#44aaff', libu_hr: '#9b59b6', emperor: '#ffd700', memorial: '#2ecc8a',
  sixDepts: '#06b6d4',
};

export const STATE_LABEL: Record<string, string> = {
  Inbox: 'state.inbox', Pending: 'state.pending', Taizi: 'state.princeTriage',
  Zhongshu: 'state.secretariatDraft', Menxia: 'state.chancelleryReview',
  Assigned: 'state.dispatched', Doing: 'state.executing', Review: 'state.underReview',
  Done: 'state.completed', Blocked: 'state.blocked', Cancelled: 'state.cancelled',
  Next: 'state.pendingExec',
};

export function deptColor(d: string): string {
  // Accept both IDs and Chinese backend names
  return DEPT_COLOR[d] || DEPT_COLOR[ORG_TO_ID[d]] || '#6a9eff';
}

export function stateLabel(t: Task): string {
  const r = t.review_round || 0;
  if (t.state === 'Menxia' && r > 1) return i18n.t('state.menxiaRound', { round: r });
  if (t.state === 'Zhongshu' && r > 0) return i18n.t('state.zhongshuRevision', { round: r });
  return i18n.t(STATE_LABEL[t.state]) || t.state;
}

export function tState(state: string): string {
  return i18n.t(STATE_LABEL[state]) || state;
}

export function isEdict(t: Task): boolean {
  return /^JJC-/i.test(t.id || '');
}

export function isSession(t: Task): boolean {
  return /^(OC-|MC-)/i.test(t.id || '');
}

export function isArchived(t: Task): boolean {
  return t.archived || ['Done', 'Cancelled'].includes(t.state);
}

export type PipeStatus = { key: string; dept: string; icon: string; action: string; status: 'done' | 'active' | 'pending' };

export function getPipeStatus(t: Task): PipeStatus[] {
  const stateIdx = PIPE_STATE_IDX[t.state] ?? 4;
  return PIPE.map((stage, i) => ({
    ...stage,
    status: (i < stateIdx ? 'done' : i === stateIdx ? 'active' : 'pending') as 'done' | 'active' | 'pending',
  }));
}

// ── Tabs ──

export type TabKey =
  | 'edicts' | 'monitor' | 'officials' | 'models'
  | 'skills' | 'sessions' | 'memorials' | 'templates' | 'morning';

export const TAB_DEFS: { key: TabKey; labelKey: string; icon: string }[] = [
  { key: 'edicts',    labelKey: 'tabs.edicts',    icon: '📜' },
  { key: 'monitor',   labelKey: 'tabs.monitor',   icon: '🏛️' },
  { key: 'officials', labelKey: 'tabs.officials', icon: '👔' },
  { key: 'models',    labelKey: 'tabs.models',    icon: '🤖' },
  { key: 'skills',    labelKey: 'tabs.skills',    icon: '🎯' },
  { key: 'sessions',  labelKey: 'tabs.sessions',  icon: '💬' },
  { key: 'memorials', labelKey: 'tabs.memorials', icon: '📜' },
  { key: 'templates', labelKey: 'tabs.templates', icon: '📋' },
  { key: 'morning',   labelKey: 'tabs.morning',   icon: '🌅' },
];

// ── DEPTS for monitor ──

export const DEPTS = [
  { id: 'taizi',    labelKey: 'depts.crownPrince', emoji: '🤴', roleKey: 'roles.crownPrince',          rankKey: 'ranks.heirApparent' },
  { id: 'zhongshu', labelKey: 'depts.zhongshu',    emoji: '📜', roleKey: 'roles.grandSecretary',        rankKey: 'ranks.rank1' },
  { id: 'menxia',   labelKey: 'depts.menxia',       emoji: '🔍', roleKey: 'roles.grandCouncillor',       rankKey: 'ranks.rank1' },
  { id: 'shangshu', labelKey: 'depts.shangshu',     emoji: '📮', roleKey: 'roles.directorSecretariat',   rankKey: 'ranks.rank1' },
  { id: 'libu',     labelKey: 'depts.libu',         emoji: '📝', roleKey: 'roles.ministerRites',         rankKey: 'ranks.rank2' },
  { id: 'hubu',     labelKey: 'depts.hubu',         emoji: '💰', roleKey: 'roles.ministerRevenue',       rankKey: 'ranks.rank2' },
  { id: 'bingbu',   labelKey: 'depts.bingbu',       emoji: '⚔️', roleKey: 'roles.ministerWar',           rankKey: 'ranks.rank2' },
  { id: 'xingbu',   labelKey: 'depts.xingbu',       emoji: '⚖️', roleKey: 'roles.ministerJustice',       rankKey: 'ranks.rank2' },
  { id: 'gongbu',   labelKey: 'depts.gongbu',       emoji: '🔧', roleKey: 'roles.ministerWorks',         rankKey: 'ranks.rank2' },
  { id: 'libu_hr',  labelKey: 'depts.libu_hr',      emoji: '👔', roleKey: 'roles.ministerPersonnel',     rankKey: 'ranks.rank2' },
  { id: 'zaochao',  labelKey: 'depts.zaochao',      emoji: '🌟', roleKey: 'roles.courtGazetteOfficer',   rankKey: 'ranks.rank3' },
];

// ── Templates ──

export interface TemplateParam {
  key: string;
  labelKey: string;
  type: 'text' | 'textarea' | 'select';
  defaultKey?: string;
  required?: boolean;
  optionKeys?: string[];
}

export interface Template {
  id: string;
  catKey: string;
  icon: string;
  nameKey: string;
  descKey: string;
  depts: string[]; // dept IDs
  estKey: string;
  costKey: string;
  params: TemplateParam[];
  commandKey: string;
}

export const TEMPLATES: Template[] = [
  {
    id: 'tpl-weekly-report', catKey: 'tplCat.dailyOffice', icon: '📝', nameKey: 'tpl.weeklyReport.name',
    descKey: 'tpl.weeklyReport.desc', depts: ['hubu', 'libu'], estKey: 'tpl.weeklyReport.est', costKey: 'tpl.weeklyReport.cost',
    params: [
      { key: 'date_range', labelKey: 'tpl.weeklyReport.dateRange', type: 'text', defaultKey: 'tpl.weeklyReport.dateRangeDefault', required: true },
      { key: 'focus', labelKey: 'tpl.weeklyReport.focus', type: 'text', defaultKey: 'tpl.weeklyReport.focusDefault' },
      { key: 'format', labelKey: 'tpl.weeklyReport.format', type: 'select', optionKeys: ['tpl.weeklyReport.formatMarkdown', 'tpl.weeklyReport.formatFeishu'], defaultKey: 'tpl.weeklyReport.formatMarkdown' },
    ],
    commandKey: 'tpl.weeklyReport.command',
  },
  {
    id: 'tpl-code-review', catKey: 'tplCat.engineering', icon: '🔍', nameKey: 'tpl.codeReview.name',
    descKey: 'tpl.codeReview.desc', depts: ['bingbu', 'xingbu'], estKey: 'tpl.codeReview.est', costKey: 'tpl.codeReview.cost',
    params: [
      { key: 'repo', labelKey: 'tpl.codeReview.repo', type: 'text', required: true },
      { key: 'scope', labelKey: 'tpl.codeReview.scope', type: 'select', optionKeys: ['tpl.codeReview.scopeFull', 'tpl.codeReview.scopeIncremental', 'tpl.codeReview.scopeSpecific'], defaultKey: 'tpl.codeReview.scopeIncremental' },
      { key: 'focus', labelKey: 'tpl.codeReview.focus', type: 'text', defaultKey: 'tpl.codeReview.focusDefault' },
    ],
    commandKey: 'tpl.codeReview.command',
  },
  {
    id: 'tpl-api-design', catKey: 'tplCat.engineering', icon: '⚡', nameKey: 'tpl.apiDesign.name',
    descKey: 'tpl.apiDesign.desc', depts: ['zhongshu', 'bingbu'], estKey: 'tpl.apiDesign.est', costKey: 'tpl.apiDesign.cost',
    params: [
      { key: 'requirement', labelKey: 'tpl.apiDesign.requirement', type: 'textarea', required: true },
      { key: 'tech', labelKey: 'tpl.apiDesign.tech', type: 'select', optionKeys: ['Python/FastAPI', 'Node/Express', 'Go/Gin'], defaultKey: 'Python/FastAPI' },
      { key: 'auth', labelKey: 'tpl.apiDesign.auth', type: 'select', optionKeys: ['JWT', 'API Key', 'tpl.apiDesign.authNone'], defaultKey: 'JWT' },
    ],
    commandKey: 'tpl.apiDesign.command',
  },
  {
    id: 'tpl-competitor', catKey: 'tplCat.dataAnalysis', icon: '📊', nameKey: 'tpl.competitor.name',
    descKey: 'tpl.competitor.desc', depts: ['bingbu', 'hubu', 'libu'], estKey: 'tpl.competitor.est', costKey: 'tpl.competitor.cost',
    params: [
      { key: 'targets', labelKey: 'tpl.competitor.targets', type: 'textarea', required: true },
      { key: 'dimensions', labelKey: 'tpl.competitor.dimensions', type: 'text', defaultKey: 'tpl.competitor.dimensionsDefault' },
      { key: 'format', labelKey: 'tpl.competitor.format', type: 'select', optionKeys: ['tpl.competitor.formatReport', 'tpl.competitor.formatTable'], defaultKey: 'tpl.competitor.formatReport' },
    ],
    commandKey: 'tpl.competitor.command',
  },
  {
    id: 'tpl-data-report', catKey: 'tplCat.dataAnalysis', icon: '📈', nameKey: 'tpl.dataReport.name',
    descKey: 'tpl.dataReport.desc', depts: ['hubu', 'libu'], estKey: 'tpl.dataReport.est', costKey: 'tpl.dataReport.cost',
    params: [
      { key: 'data_source', labelKey: 'tpl.dataReport.dataSource', type: 'text', required: true },
      { key: 'questions', labelKey: 'tpl.dataReport.questions', type: 'textarea' },
      { key: 'viz', labelKey: 'tpl.dataReport.viz', type: 'select', optionKeys: ['tpl.dataReport.vizYes', 'tpl.dataReport.vizNo'], defaultKey: 'tpl.dataReport.vizYes' },
    ],
    commandKey: 'tpl.dataReport.command',
  },
  {
    id: 'tpl-blog', catKey: 'tplCat.contentCreation', icon: '✍️', nameKey: 'tpl.blog.name',
    descKey: 'tpl.blog.desc', depts: ['libu'], estKey: 'tpl.blog.est', costKey: 'tpl.blog.cost',
    params: [
      { key: 'topic', labelKey: 'tpl.blog.topic', type: 'text', required: true },
      { key: 'audience', labelKey: 'tpl.blog.audience', type: 'text', defaultKey: 'tpl.blog.audienceDefault' },
      { key: 'length', labelKey: 'tpl.blog.length', type: 'select', optionKeys: ['tpl.blog.length1k', 'tpl.blog.length2k', 'tpl.blog.length3k'], defaultKey: 'tpl.blog.length2k' },
      { key: 'style', labelKey: 'tpl.blog.style', type: 'select', optionKeys: ['tpl.blog.styleTutorial', 'tpl.blog.styleOpinion', 'tpl.blog.styleCaseStudy'], defaultKey: 'tpl.blog.styleTutorial' },
    ],
    commandKey: 'tpl.blog.command',
  },
  {
    id: 'tpl-deploy', catKey: 'tplCat.engineering', icon: '🚀', nameKey: 'tpl.deploy.name',
    descKey: 'tpl.deploy.desc', depts: ['bingbu', 'gongbu'], estKey: 'tpl.deploy.est', costKey: 'tpl.deploy.cost',
    params: [
      { key: 'project', labelKey: 'tpl.deploy.project', type: 'text', required: true },
      { key: 'env', labelKey: 'tpl.deploy.env', type: 'select', optionKeys: ['Docker', 'K8s', 'VPS', 'Serverless'], defaultKey: 'Docker' },
      { key: 'ci', labelKey: 'tpl.deploy.ci', type: 'select', optionKeys: ['GitHub Actions', 'GitLab CI', 'tpl.deploy.ciNone'], defaultKey: 'GitHub Actions' },
    ],
    commandKey: 'tpl.deploy.command',
  },
  {
    id: 'tpl-email', catKey: 'tplCat.contentCreation', icon: '📧', nameKey: 'tpl.email.name',
    descKey: 'tpl.email.desc', depts: ['libu'], estKey: 'tpl.email.est', costKey: 'tpl.email.cost',
    params: [
      { key: 'scenario', labelKey: 'tpl.email.scenario', type: 'select', optionKeys: ['tpl.email.scenarioBusiness', 'tpl.email.scenarioLaunch', 'tpl.email.scenarioNotice', 'tpl.email.scenarioInternal'], defaultKey: 'tpl.email.scenarioBusiness' },
      { key: 'purpose', labelKey: 'tpl.email.purpose', type: 'textarea', required: true },
      { key: 'tone', labelKey: 'tpl.email.tone', type: 'select', optionKeys: ['tpl.email.toneFormal', 'tpl.email.toneFriendly', 'tpl.email.toneConcise'], defaultKey: 'tpl.email.toneFormal' },
    ],
    commandKey: 'tpl.email.command',
  },
  {
    id: 'tpl-standup', catKey: 'tplCat.dailyOffice', icon: '🗓️', nameKey: 'tpl.standup.name',
    descKey: 'tpl.standup.desc', depts: ['shangshu'], estKey: 'tpl.standup.est', costKey: 'tpl.standup.cost',
    params: [
      { key: 'range', labelKey: 'tpl.standup.range', type: 'select', optionKeys: ['tpl.standup.rangeToday', 'tpl.standup.rangeLast24h', 'tpl.standup.rangeYesterdayToday'], defaultKey: 'tpl.standup.rangeToday' },
    ],
    commandKey: 'tpl.standup.command',
  },
];

export const TPL_CATS = [
  { nameKey: 'tplCat.all', icon: '📋' },
  { nameKey: 'tplCat.dailyOffice', icon: '💼' },
  { nameKey: 'tplCat.dataAnalysis', icon: '📊' },
  { nameKey: 'tplCat.engineering', icon: '⚙️' },
  { nameKey: 'tplCat.contentCreation', icon: '✍️' },
];

// ── Main Store ──

interface AppStore {
  // Data
  liveStatus: LiveStatus | null;
  agentConfig: AgentConfig | null;
  changeLog: ChangeLogEntry[];
  officialsData: OfficialsData | null;
  agentsStatusData: AgentsStatusData | null;
  morningBrief: MorningBrief | null;
  subConfig: SubConfig | null;

  // UI State
  activeTab: TabKey;
  edictFilter: 'active' | 'archived' | 'all';
  sessFilter: string;
  tplCatFilter: string;
  selectedOfficial: string | null;
  modalTaskId: string | null;
  countdown: number;

  // Toast
  toasts: { id: number; msg: string; type: 'ok' | 'err' }[];

  // Actions
  setActiveTab: (tab: TabKey) => void;
  setEdictFilter: (f: 'active' | 'archived' | 'all') => void;
  setSessFilter: (f: string) => void;
  setTplCatFilter: (f: string) => void;
  setSelectedOfficial: (id: string | null) => void;
  setModalTaskId: (id: string | null) => void;
  setCountdown: (n: number) => void;
  toast: (msg: string, type?: 'ok' | 'err') => void;

  // Data fetching
  loadLive: () => Promise<void>;
  loadAgentConfig: () => Promise<void>;
  loadOfficials: () => Promise<void>;
  loadAgentsStatus: () => Promise<void>;
  loadMorning: () => Promise<void>;
  loadSubConfig: () => Promise<void>;
  loadAll: () => Promise<void>;
}

let _toastId = 0;

export const useStore = create<AppStore>((set, get) => ({
  liveStatus: null,
  agentConfig: null,
  changeLog: [],
  officialsData: null,
  agentsStatusData: null,
  morningBrief: null,
  subConfig: null,

  activeTab: 'edicts',
  edictFilter: 'active',
  sessFilter: 'all',
  tplCatFilter: 'tplCat.all',
  selectedOfficial: null,
  modalTaskId: null,
  countdown: 5,

  toasts: [],

  setActiveTab: (tab) => {
    set({ activeTab: tab });
    const s = get();
    if (['models', 'skills', 'sessions'].includes(tab) && !s.agentConfig) s.loadAgentConfig();
    if (tab === 'officials' && !s.officialsData) s.loadOfficials();
    if (tab === 'monitor') s.loadAgentsStatus();
    if (tab === 'morning' && !s.morningBrief) s.loadMorning();
  },
  setEdictFilter: (f) => set({ edictFilter: f }),
  setSessFilter: (f) => set({ sessFilter: f }),
  setTplCatFilter: (f) => set({ tplCatFilter: f }),
  setSelectedOfficial: (id) => set({ selectedOfficial: id }),
  setModalTaskId: (id) => set({ modalTaskId: id }),
  setCountdown: (n) => set({ countdown: n }),

  toast: (msg, type = 'ok') => {
    const id = ++_toastId;
    set((s) => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3000);
  },

  loadLive: async () => {
    try {
      const data = await api.liveStatus();
      set({ liveStatus: data });
      const s = get();
      if (!s.officialsData) {
        api.officialsStats().then((d) => set({ officialsData: d })).catch(() => {});
      }
    } catch {
      // silently fail
    }
  },

  loadAgentConfig: async () => {
    try {
      const cfg = await api.agentConfig();
      const log = await api.modelChangeLog();
      set({ agentConfig: cfg, changeLog: log });
    } catch {
      // silently fail
    }
  },

  loadOfficials: async () => {
    try {
      const data = await api.officialsStats();
      set({ officialsData: data });
    } catch {
      // silently fail
    }
  },

  loadAgentsStatus: async () => {
    try {
      const data = await api.agentsStatus();
      set({ agentsStatusData: data });
    } catch {
      set({ agentsStatusData: null });
    }
  },

  loadMorning: async () => {
    try {
      const [brief, config] = await Promise.all([api.morningBrief(), api.morningConfig()]);
      set({ morningBrief: brief, subConfig: config });
    } catch {
      // silently fail
    }
  },

  loadSubConfig: async () => {
    try {
      const config = await api.morningConfig();
      set({ subConfig: config });
    } catch {
      // silently fail
    }
  },

  loadAll: async () => {
    const s = get();
    await s.loadLive();
    const tab = s.activeTab;
    if (['models', 'skills'].includes(tab)) await s.loadAgentConfig();
  },
}));

// ── Countdown & Polling ──

let _cdTimer: ReturnType<typeof setInterval> | null = null;

export function startPolling() {
  if (_cdTimer) return;
  useStore.getState().loadAll();
  _cdTimer = setInterval(() => {
    const s = useStore.getState();
    const cd = s.countdown - 1;
    if (cd <= 0) {
      s.setCountdown(5);
      s.loadAll();
    } else {
      s.setCountdown(cd);
    }
  }, 1000);
}

export function stopPolling() {
  if (_cdTimer) {
    clearInterval(_cdTimer);
    _cdTimer = null;
  }
}

// ── Utility ──

export function esc(s: string | undefined | null): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function timeAgo(iso: string | undefined): string {
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return i18n.t('time.justNow');
    if (mins < 60) return i18n.t('time.minutesAgo', { count: mins });
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return i18n.t('time.hoursAgo', { count: hrs });
    return i18n.t('time.daysAgo', { count: Math.floor(hrs / 24) });
  } catch {
    return '';
  }
}

/** Resolve a potential i18n key — if it looks like a dotted key, translate; otherwise return as-is */
export function tKey(key: string): string {
  if (key.includes('.')) return i18n.t(key);
  return key;
}
