import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, DEPTS, isEdict, stateLabel, tOrg, ORG_TO_ID } from '../store';
import { api, type OfficialInfo } from '../api';

export default function MonitorPanel() {
  const { t } = useTranslation();
  const liveStatus = useStore((s) => s.liveStatus);
  const agentsStatusData = useStore((s) => s.agentsStatusData);
  const officialsData = useStore((s) => s.officialsData);
  const loadAgentsStatus = useStore((s) => s.loadAgentsStatus);
  const setModalTaskId = useStore((s) => s.setModalTaskId);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    loadAgentsStatus();
  }, [loadAgentsStatus]);

  const tasks = liveStatus?.tasks || [];
  const activeTasks = tasks.filter((tk) => isEdict(tk) && tk.state !== 'Done' && tk.state !== 'Next');

  // Build official map
  const offMap: Record<string, OfficialInfo> = {};
  if (officialsData?.officials) {
    officialsData.officials.forEach((o) => { offMap[o.id] = o; });
  }

  // Agent wake
  const handleWake = async (agentId: string) => {
    try {
      const r = await api.agentWake(agentId);
      toast(r.message || t('monitor.wakeSuccess'));
      setTimeout(() => loadAgentsStatus(), 30000);
    } catch { toast(t('monitor.wakeFailed'), 'err'); }
  };

  const handleWakeAll = async () => {
    if (!agentsStatusData) return;
    const toWake = agentsStatusData.agents.filter(
      (a) => a.id !== 'main' && a.status !== 'running' && a.status !== 'unconfigured'
    );
    if (!toWake.length) { toast(t('monitor.allOnline')); return; }
    toast(t('monitor.wakingAgents', { count: toWake.length }));
    for (const a of toWake) {
      try { await api.agentWake(a.id); } catch { /* ignore */ }
    }
    toast(t('monitor.wakeCommandsSent', { count: toWake.length }));
    setTimeout(() => loadAgentsStatus(), 30000);
  };

  // Agent Status Panel
  const asData = agentsStatusData;
  const filtered = asData?.agents?.filter((a) => a.id !== 'main') || [];
  const running = filtered.filter((a) => a.status === 'running').length;
  const idle = filtered.filter((a) => a.status === 'idle').length;
  const offline = filtered.filter((a) => a.status === 'offline').length;
  const unconf = filtered.filter((a) => a.status === 'unconfigured').length;
  const gw = asData?.gateway;
  const gwCls = gw?.probe ? 'ok' : gw?.alive ? 'warn' : 'err';

  return (
    <div>
      {/* Agent Status Panel */}
      {asData && asData.ok && (
        <div className="as-panel">
          <div className="as-header">
            <span className="as-title">🔌 {t('monitor.agentStatus')}</span>
            <span className={`as-gw ${gwCls}`}>Gateway: {gw?.status || t('common.unknown')}</span>
            <button className="btn-refresh" onClick={() => loadAgentsStatus()} style={{ marginLeft: 8 }}>
              {t('monitor.refreshBtn')}
            </button>
            {(offline + unconf > 0) && (
              <button className="btn-refresh" onClick={handleWakeAll} style={{ marginLeft: 4, borderColor: 'var(--warn)', color: 'var(--warn)' }}>
                {t('monitor.wakeAll')}
              </button>
            )}
          </div>
          <div className="as-grid">
            {filtered.map((a) => {
              const canWake = a.status !== 'running' && a.status !== 'unconfigured' && gw?.alive;
              return (
                <div key={a.id} className="as-card" title={`${a.role} · ${a.statusLabel}`}>
                  <div className={`as-dot ${a.status}`} />
                  <div style={{ fontSize: 22 }}>{a.emoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{a.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.role}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.statusLabel}</div>
                  {a.lastActive ? (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>⏰ {a.lastActive}</div>
                  ) : (
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{t('monitor.noActivity')}</div>
                  )}
                  {canWake && (
                    <button className="as-wake-btn" onClick={(e) => { e.stopPropagation(); handleWake(a.id); }}>
                      {t('monitor.wakeBtn')}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="as-summary">
            <span><span className="as-dot running" style={{ position: 'static', width: 8, height: 8 }} /> {t('monitor.running', { count: running })}</span>
            <span><span className="as-dot idle" style={{ position: 'static', width: 8, height: 8 }} /> {t('monitor.idle', { count: idle })}</span>
            {offline > 0 && <span><span className="as-dot offline" style={{ position: 'static', width: 8, height: 8 }} /> {t('monitor.offline', { count: offline })}</span>}
            {unconf > 0 && <span><span className="as-dot unconfigured" style={{ position: 'static', width: 8, height: 8 }} /> {t('monitor.unconfigured', { count: unconf })}</span>}
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)' }}>
              {t('monitor.checkedAt')} {(asData.checkedAt || '').substring(11, 19)}
            </span>
          </div>
        </div>
      )}

      {/* Duty Grid */}
      <div className="duty-grid">
        {DEPTS.map((d) => {
          const myTasks = activeTasks.filter((tk) => ORG_TO_ID[tk.org] === d.id);
          const isActive = myTasks.some((tk) => tk.state === 'Doing');
          const isBlocked = myTasks.some((tk) => tk.state === 'Blocked');
          const off = offMap[d.id];
          const hb = off?.heartbeat || { status: 'idle', label: '⚪' };
          const dotCls = isBlocked ? 'blocked' : isActive ? 'busy' : hb.status === 'active' ? 'active' : 'idle';
          const statusText = isBlocked ? t('monitor.statusBlocked') : isActive ? t('monitor.statusExecuting') : hb.status === 'active' ? t('monitor.statusActive') : t('monitor.statusIdle');
          const cardCls = isBlocked ? 'blocked-card' : isActive ? 'active-card' : '';

          return (
            <div key={d.id} className={`duty-card ${cardCls}`}>
              <div className="dc-hdr">
                <span className="dc-emoji">{d.emoji}</span>
                <div className="dc-info">
                  <div className="dc-name">{t(d.labelKey)}</div>
                  <div className="dc-role">{t(d.roleKey)} · {t(d.rankKey)}</div>
                </div>
                <div className="dc-status">
                  <span className={`dc-dot ${dotCls}`} />
                  <span>{statusText}</span>
                </div>
              </div>
              <div className="dc-body">
                {myTasks.length > 0 ? (
                  myTasks.map((tk) => (
                    <div key={tk.id} className="dc-task" onClick={() => setModalTaskId(tk.id)}>
                      <div className="dc-task-id">{tk.id}</div>
                      <div className="dc-task-title">{tk.title || t('common.noTitle')}</div>
                      {tk.now && tk.now !== '-' && (
                        <div className="dc-task-now">{tk.now.substring(0, 70)}</div>
                      )}
                      <div className="dc-task-meta">
                        <span className={`tag st-${tk.state}`}>{stateLabel(tk)}</span>
                        {tk.block && tk.block !== '无' && (
                          <span className="tag" style={{ borderColor: '#ff527044', color: 'var(--danger)' }}>🚫{tk.block}</span>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="dc-idle">
                    <span style={{ fontSize: 20 }}>🪭</span>
                    <span>{t('monitor.onStandby')}</span>
                  </div>
                )}
              </div>
              <div className="dc-footer">
                <span className="dc-model">🤖 {off?.model_short || t('monitor.pendingConfig')}</span>
                {off?.last_active && <span className="dc-la">⏰ {off.last_active}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
