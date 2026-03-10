import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, TEMPLATES, TPL_CATS, tKey, ID_TO_ORG } from '../store';
import type { Template } from '../store';
import { api } from '../api';

export default function TemplatePanel() {
  const { t } = useTranslation();
  const tplCatFilter = useStore((s) => s.tplCatFilter);
  const setTplCatFilter = useStore((s) => s.setTplCatFilter);
  const toast = useStore((s) => s.toast);
  const loadAll = useStore((s) => s.loadAll);

  const [formTpl, setFormTpl] = useState<Template | null>(null);
  const [formVals, setFormVals] = useState<Record<string, string>>({});
  const [previewCmd, setPreviewCmd] = useState('');

  let tpls = TEMPLATES;
  if (tplCatFilter !== 'tplCat.all') tpls = tpls.filter((t) => t.catKey === tplCatFilter);

  const openForm = (tpl: Template) => {
    const vals: Record<string, string> = {};
    tpl.params.forEach((p) => {
      vals[p.key] = p.defaultKey ? tKey(p.defaultKey) : '';
    });
    setFormVals(vals);
    setFormTpl(tpl);
    setPreviewCmd('');
  };

  const buildCmd = (tpl: Template) => {
    let cmd = t(tpl.commandKey);
    for (const p of tpl.params) {
      cmd = cmd.replace(new RegExp('\\{' + p.key + '\\}', 'g'), formVals[p.key] || (p.defaultKey ? tKey(p.defaultKey) : ''));
    }
    return cmd;
  };

  const preview = () => {
    if (!formTpl) return;
    setPreviewCmd(buildCmd(formTpl));
  };

  const execute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTpl) return;
    const cmd = buildCmd(formTpl);
    if (!cmd.trim()) {
      toast(t('templates.fillRequired'), 'err');
      return;
    }

    // Pre-check gateway
    try {
      const st = await api.agentsStatus();
      if (st.ok && st.gateway && !st.gateway.alive) {
        toast(t('templates.gatewayNotStarted'), 'err');
        if (!confirm(t('templates.gatewayNotStartedContinue'))) return;
      }
    } catch {
      /* ignore */
    }

    if (!confirm(`${t('templates.confirmDecree')}\n\n${cmd.substring(0, 200)}${cmd.length > 200 ? '…' : ''}`)) return;

    try {
      const params: Record<string, string> = {};
      for (const p of formTpl.params) {
        params[p.key] = formVals[p.key] || (p.defaultKey ? tKey(p.defaultKey) : '');
      }
      const r = await api.createTask({
        title: cmd.substring(0, 120),
        org: ID_TO_ORG['zhongshu'],
        targetDept: ID_TO_ORG[formTpl.depts[0]] || '',
        priority: 'normal',
        templateId: formTpl.id,
        params,
      });
      if (r.ok) {
        toast(t('templates.decreeIssued', { id: r.taskId }), 'ok');
        setFormTpl(null);
        loadAll();
      } else {
        toast(r.error || t('templates.decreeFailed'), 'err');
      }
    } catch {
      toast(t('templates.serverError'), 'err');
    }
  };

  return (
    <div>
      {/* Category filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
        {TPL_CATS.map((c) => (
          <span
            key={c.nameKey}
            className={`tpl-cat${tplCatFilter === c.nameKey ? ' active' : ''}`}
            onClick={() => setTplCatFilter(c.nameKey)}
          >
            {c.icon} {t(c.nameKey)}
          </span>
        ))}
      </div>

      {/* Grid */}
      <div className="tpl-grid">
        {tpls.map((tpl) => (
          <div className="tpl-card" key={tpl.id}>
            <div className="tpl-top">
              <span className="tpl-icon">{tpl.icon}</span>
              <span className="tpl-name">{t(tpl.nameKey)}</span>
            </div>
            <div className="tpl-desc">{t(tpl.descKey)}</div>
            <div className="tpl-footer">
              {tpl.depts.map((deptId) => (
                <span className="tpl-dept" key={deptId}>{t('depts.' + deptId)}</span>
              ))}
              <span className="tpl-est">
                {t(tpl.estKey)} · {t(tpl.costKey)}
              </span>
              <button className="tpl-go" onClick={() => openForm(tpl)}>
                {t('templates.issueDecree')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Template Form Modal */}
      {formTpl && (
        <div className="modal-bg open" onClick={() => setFormTpl(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setFormTpl(null)}>✕</button>
            <div className="modal-body">
              <div style={{ fontSize: 11, color: 'var(--acc)', fontWeight: 700, letterSpacing: '.04em', marginBottom: 4 }}>
                {t('templates.decreeTemplate')}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                {formTpl.icon} {t(formTpl.nameKey)}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 18 }}>{t(formTpl.descKey)}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
                {formTpl.depts.map((deptId) => (
                  <span className="tpl-dept" key={deptId}>{t('depts.' + deptId)}</span>
                ))}
                <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>
                  {t(formTpl.estKey)} · {t(formTpl.costKey)}
                </span>
              </div>

              <form className="tpl-form" onSubmit={execute}>
                {formTpl.params.map((p) => (
                  <div className="tpl-field" key={p.key}>
                    <label className="tpl-label">
                      {t(p.labelKey)}
                      {p.required && <span style={{ color: '#ff5270' }}> *</span>}
                    </label>
                    {p.type === 'textarea' ? (
                      <textarea
                        className="tpl-input"
                        style={{ minHeight: 80, resize: 'vertical' }}
                        required={p.required}
                        value={formVals[p.key] || ''}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      />
                    ) : p.type === 'select' ? (
                      <select
                        className="tpl-input"
                        value={formVals[p.key] || (p.defaultKey ? tKey(p.defaultKey) : '')}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      >
                        {(p.optionKeys || []).map((optKey) => (
                          <option key={optKey} value={tKey(optKey)}>{tKey(optKey)}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        className="tpl-input"
                        type="text"
                        required={p.required}
                        value={formVals[p.key] || ''}
                        onChange={(e) => setFormVals((v) => ({ ...v, [p.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}

                {previewCmd && (
                  <div
                    style={{
                      background: 'var(--panel2)',
                      border: '1px solid var(--line)',
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 14,
                      fontSize: 12,
                      color: 'var(--muted)',
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                      {t('templates.previewText')}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{previewCmd}</div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn btn-g" onClick={preview} style={{ padding: '8px 16px', fontSize: 12 }}>
                    {t('templates.previewBtn')}
                  </button>
                  <button type="submit" className="tpl-go" style={{ padding: '8px 20px', fontSize: 13 }}>
                    {t('templates.issueDecreeBtn')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
