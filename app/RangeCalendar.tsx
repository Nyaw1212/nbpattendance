'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './RangeCalendar.module.css';

type Props = {
  rangeStart: string;
  rangeEnd: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
};

function parseIso(value: string) { return new Date(`${value}T12:00:00`); }
function iso(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
function monthStart(value: string) { const d = parseIso(value); return new Date(d.getFullYear(), d.getMonth(), 1, 12); }
function orderedRange(a: string, b: string) { return a <= b ? [a, b] as const : [b, a] as const; }

export default function RangeCalendar({ rangeStart, rangeEnd, onStartChange, onEndChange }: Props) {
  const [viewMonth, setViewMonth] = useState(() => monthStart(rangeStart));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [awaitingEnd, setAwaitingEnd] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dragMoved, setDragMoved] = useState(false);
  const ignoreClick = useRef(false);

  useEffect(() => { if (!dragging) setViewMonth(monthStart(rangeStart)); }, [rangeStart, dragging]);

  const days = useMemo(() => {
    const first = new Date(viewMonth);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + index); return d; });
  }, [viewMonth]);

  function moveMonth(offset: number) { setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1, 12)); }
  function setRange(a: string, b: string) { const [start, end] = orderedRange(a, b); onStartChange(start); onEndChange(end); }

  function chooseByClick(dayIso: string) {
    if (ignoreClick.current) { ignoreClick.current = false; return; }
    if (awaitingEnd) {
      // A preset/current date already exists, so the first ordinary click is the END date.
      setRange(rangeStart, dayIso);
      setAwaitingEnd(false);
      setAnchor(null);
    } else {
      // Previous range is complete. Start a fresh range.
      setAnchor(dayIso);
      onStartChange(dayIso);
      onEndChange(dayIso);
      setAwaitingEnd(true);
    }
  }

  function beginDrag(dayIso: string) {
    setDragging(true);
    setDragMoved(false);
    setAnchor(awaitingEnd ? rangeStart : dayIso);
  }

  function extendDrag(dayIso: string) {
    if (!dragging || !anchor) return;
    if (dayIso !== anchor) {
      setDragMoved(true);
      setRange(anchor, dayIso);
    }
  }

  function finishDrag() {
    if (!dragging) return;
    setDragging(false);
    if (dragMoved) {
      ignoreClick.current = true;
      setAwaitingEnd(false);
      setAnchor(null);
    }
  }

  const start = parseIso(rangeStart);
  const end = parseIso(rangeEnd);

  return (
    <div className={styles.calendar}>
      <div className={styles.top}>
        <div>
          <span>SELECT RANGE</span>
          <small>{awaitingEnd ? `Start: ${rangeStart} — click the END date (or drag).` : 'Range selected. Click a new START date to change it, then click the END date.'}</small>
        </div>
        <div className={styles.nav}>
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
          <strong>{viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className={styles.weekdays}>{['Su','Mo','Tu','We','Th','Fr','Sa'].map(day => <span key={day}>{day}</span>)}</div>
      <div className={styles.days}>
        {days.map(day => {
          const dayIso = iso(day);
          const outside = day.getMonth() !== viewMonth.getMonth();
          const isStart = dayIso === rangeStart;
          const isEnd = dayIso === rangeEnd;
          const inRange = day >= start && day <= end;
          const classes = [outside ? styles.outside : '', inRange ? styles.inRange : '', isStart ? styles.rangeStart : '', isEnd ? styles.rangeEnd : ''].filter(Boolean).join(' ');
          return <button type="button" key={dayIso} className={classes}
            onClick={() => chooseByClick(dayIso)}
            onMouseDown={() => beginDrag(dayIso)}
            onMouseEnter={() => extendDrag(dayIso)}
            onMouseUp={finishDrag}>{day.getDate()}</button>;
        })}
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.today} onClick={() => {
          const today = iso(new Date());
          onStartChange(today); onEndChange(today); setViewMonth(monthStart(today)); setAwaitingEnd(true); setAnchor(today);
        }}>Today</button>
        <span>{rangeStart} → {rangeEnd}</span>
      </div>
    </div>
  );
}
