import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore, isEdict } from '../store';

export default function CourtCeremony() {
  const { t } = useTranslation();
  const liveStatus = useStore((s) => s.liveStatus);
  const [show, setShow] = useState(false);
  const [out, setOut] = useState(false);

  useEffect(() => {
    const lastOpen = localStorage.getItem('openclaw_court_date');
    const today = new Date().toISOString().substring(0, 10);
    const pref = JSON.parse(localStorage.getItem('openclaw_court_pref') || '{"enabled":true}');
    if (!pref.enabled || lastOpen === today) return;
    localStorage.setItem('openclaw_court_date', today);
    setShow(true);
    const timer = setTimeout(() => skip(), 3500);
    return () => clearTimeout(timer);
  }, []);

  const skip = () => {
    setOut(true);
    setTimeout(() => setShow(false), 500);
  };

  if (!show) return null;

  const tasks = liveStatus?.tasks || [];
  const jjc = tasks.filter(isEdict);
  const pending = jjc.filter((t) => !['Done', 'Cancelled'].includes(t.state)).length;
  const done = jjc.filter((t) => t.state === 'Done').length;
  const overdue = jjc.filter(
    (t) => t.state !== 'Done' && t.state !== 'Cancelled' && t.eta && new Date(t.eta.replace(' ', 'T')) < new Date()
  ).length;

  const d = new Date();
  const days = t('ceremony.days', { returnObjects: true }) as string[];
  const dateStr = t('ceremony.dateFormat', { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), dayName: days[d.getDay()] });

  return (
    <div className={`ceremony-bg${out ? ' out' : ''}`} onClick={skip}>
      <div className="crm-glow" />
      <div className="crm-line1 in">{t('ceremony.courtBegins')}</div>
      <div className="crm-line2 in">{t('ceremony.speakOrAdjourn')}</div>
      <div className="crm-line3 in">
        {t('ceremony.summary', { pending, done })}{overdue > 0 ? t('ceremony.overdue', { overdue }) : ''}
      </div>
      <div className="crm-date in">{dateStr}</div>
      <div className="crm-skip">{t('ceremony.clickToSkip')}</div>
    </div>
  );
}
