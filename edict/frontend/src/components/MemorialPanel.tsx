import { useState } from 'react';
import { useStore, isEdict, tState, tOrg } from '../store';
import type { Task, FlowEntry } from '../api';
import { useTranslation } from 'react-i18next';

export default function MemorialPanel() {
  const { t } = useTranslation();
  const liveStatus = useStore((s) => s.liveStatus);
  const [filter, setFilter] = useState('all');
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const toast = useStore((s) => s.toast);

  const tasks = liveStatus?.tasks || [];
  let mems = tasks.filter((t) => isEdict(t) && ['Done', 'Cancelled'].includes(t.state));
  if (filter !== 'all') mems = mems.filter((t) => t.state === filter);

  const exportMemorial = (task: Task) => {
    const fl = task.flow_log || [];
    let md = `# 📜 奏折 · ${task.title}\n\n`;
    md += `- **${t('memorials.taskId')}**: ${task.id}\n`;
    md += `- **${t('memorials.status')}**: ${task.state}\n`;
    md += `- **${t('memorials.department')}**: ${tOrg(task.org)}\n`;
    if (fl.length) {
      const startAt = fl[0].at ? fl[0].at.substring(0, 19).replace('T', ' ') : t('common.unknown');
      const endAt = fl[fl.length - 1].at ? fl[fl.length - 1].at.substring(0, 19).replace('T', ' ') : t('common.unknown');
      md += `- **${t('memorials.startTime')}**: ${startAt}\n`;
      md += `- **${t('memorials.completionTime')}**: ${endAt}\n`;
    }
    md += `\n## ${t('memorials.flowRecord')}\n\n`;
    for (const f of fl) {
      md += `- **${tOrg(f.from)}** → **${tOrg(f.to)}**  \n  ${f.remark}  \n  _${(f.at || '').substring(0, 19)}_\n\n`;
    }
    if (task.output && task.output !== '-') md += `## ${t('memorials.output')}\n\n\`${task.output}\`\n`;
    navigator.clipboard.writeText(md).then(
      () => toast(t('memorials.copySuccess'), 'ok'),
      () => toast(t('memorials.copyFailed'), 'err')
    );
  };

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{t('memorials.filter')}</span>
        {[
          { key: 'all', label: t('memorials.all') },
          { key: 'Done', label: t('memorials.completed') },
          { key: 'Cancelled', label: t('memorials.cancelled') },
        ].map((f) => (
          <span
            key={f.key}
            className={`sess-filter${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </span>
        ))}
      </div>

      {/* List */}
      <div className="mem-list">
        {!mems.length ? (
          <div className="mem-empty">{t('memorials.noMemorials')}</div>
        ) : (
          mems.map((task) => {
            const fl = task.flow_log || [];
            const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== '皇上'))];
            const firstAt = fl.length ? (fl[0].at || '').substring(0, 16).replace('T', ' ') : '';
            const lastAt = fl.length ? (fl[fl.length - 1].at || '').substring(0, 16).replace('T', ' ') : '';
            const stIcon = task.state === 'Done' ? '✅' : '🚫';
            return (
              <div className="mem-card" key={task.id} onClick={() => setDetailTask(task)}>
                <div className="mem-icon">📜</div>
                <div className="mem-info">
                  <div className="mem-title">
                    {stIcon} {task.title || task.id}
                  </div>
                  <div className="mem-sub">
                    {task.id} · {tOrg(task.org || '')} · {t('memorials.flowSteps', { count: fl.length })}
                  </div>
                  <div className="mem-tags">
                    {depts.slice(0, 5).map((d) => (
                      <span className="mem-tag" key={d}>{tOrg(d)}</span>
                    ))}
                  </div>
                </div>
                <div className="mem-right">
                  <span className="mem-date">{firstAt}</span>
                  {lastAt !== firstAt && <span className="mem-date">{lastAt}</span>}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {detailTask && (
        <MemorialDetailModal task={detailTask} onClose={() => setDetailTask(null)} onExport={exportMemorial} />
      )}
    </div>
  );
}

function MemorialDetailModal({
  task: t,
  onClose,
  onExport,
}: {
  task: Task;
  onClose: () => void;
  onExport: (t: Task) => void;
}) {
  const { t: tr } = useTranslation();
  const fl = t.flow_log || [];
  const st = t.state || 'Unknown';
  const stIcon = st === 'Done' ? '✅' : st === 'Cancelled' ? '🚫' : '🔄';
  const depts = [...new Set(fl.map((f) => f.from).concat(fl.map((f) => f.to)).filter((x) => x && x !== '皇上'))];

  // Reconstruct phases
  const originLog: FlowEntry[] = [];
  const planLog: FlowEntry[] = [];
  const reviewLog: FlowEntry[] = [];
  const execLog: FlowEntry[] = [];
  const resultLog: FlowEntry[] = [];
  for (const f of fl) {
    if (f.from === '皇上') originLog.push(f);
    else if (f.to === '中书省' || f.from === '中书省') planLog.push(f);
    else if (f.to === '门下省' || f.from === '门下省') reviewLog.push(f);
    else if (f.remark && (f.remark.includes('完成') || f.remark.includes('回奏'))) resultLog.push(f);
    else execLog.push(f);
  }

  const renderPhase = (title: string, icon: string, items: FlowEntry[]) => {
    if (!items.length) return null;
    return (
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>
          {icon} {title}
        </div>
        <div className="md-timeline">
          {items.map((f, i) => {
            const dotCls = f.remark?.includes('✅') ? 'green' : f.remark?.includes('驳') ? 'red' : '';
            return (
              <div className="md-tl-item" key={i}>
                <div className={`md-tl-dot ${dotCls}`} />
                <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span className="md-tl-from">{tOrg(f.from)}</span>
                  <span className="md-tl-to">→ {tOrg(f.to)}</span>
                </div>
                <div className="md-tl-remark">{f.remark}</div>
                <div className="md-tl-time">{(f.at || '').substring(0, 19).replace('T', ' ')}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-bg open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>✕</button>
        <div className="modal-body">
          <div style={{ fontSize: 11, color: 'var(--acc)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>{t.id}</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>{stIcon} {t.title || t.id}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            <span className={`tag st-${st}`}>{tState(st)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tOrg(t.org)}</span>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tr('memorials.flowSteps', { count: fl.length })}</span>
            {depts.map((d) => (
              <span className="mem-tag" key={d}>{tOrg(d)}</span>
            ))}
          </div>

          {t.now && (
            <div style={{ background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: 12, color: 'var(--muted)' }}>
              {t.now}
            </div>
          )}

          {renderPhase(tr('memorials.originalDecree'), '👑', originLog)}
          {renderPhase(tr('memorials.secretariatPlan'), '📋', planLog)}
          {renderPhase(tr('memorials.chancelleryReview'), '🔍', reviewLog)}
          {renderPhase(tr('memorials.ministryExecution'), '⚔️', execLog)}
          {renderPhase(tr('memorials.summaryMemorial'), '📨', resultLog)}

          {t.output && t.output !== '-' && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>{tr('memorials.outputSection')}</div>
              <code style={{ fontSize: 11, wordBreak: 'break-all' }}>{t.output}</code>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button className="btn btn-g" onClick={() => onExport(t)} style={{ fontSize: 12, padding: '6px 16px' }}>
              {tr('memorials.copyMemorial')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
