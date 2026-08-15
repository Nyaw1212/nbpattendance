'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './RangeCalendar.module.css';

type Props = {
  rangeStart: string;
  rangeEnd: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
};

function parseIso(value: string) {
  return new Date(`${value}T12:00:00`);
}

function iso(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function monthStart(value: string) {
  const d = parseIso(value);
  return new Date(d.getFullYear(), d.getMonth(), 1, 12);
}

function orderedRange(a: string, b: string) {
  return a <= b ? [a, b] as const : [b, a] as const;
}

export default function RangeCalendar({ rangeStart, rangeEnd, onStartChange, onEndChange }: Props) {
  const [viewMonth, setViewMonth] = useState(() => monthStart(rangeStart));
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [moved, setMoved] = useState(false);
  const [awaitingEnd, setAwaitingEnd] = useState(false);

  useEffect(() => {
    if (!dragging) setViewMonth(monthStart(rangeStart));
  }, [rangeStart, dragging]);

  useEffect(() => {
    const stop = () => {
      if (!dragging) return;
      setDragging(false);
      if (moved) setAwaitingEnd(false);
    };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, [dragging, moved]);

  const days = useMemo(() => {
    const first = new Date(viewMonth);
    const gridStart = new Date(first);
    gridStart.setDate(first.getDate() - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + index);
      return d;
    });
  }, [viewMonth]);

  function moveMonth(offset: number) {
    setViewMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1, 12));
  }

  function setRange(a: string, b: string) {
    const [start, end] = orderedRange(a, b);
    onStartChange(start);
    onEndChange(end);
  }

  function beginSelection(dayIso: string) {
    if (awaitingEnd) {
      const existingAnchor = rangeStart;
      setAnchor(existingAnchor);
      setRange(existingAnchor, dayIso);
      setDragging(true);
      setMoved(dayIso !== existingAnchor);
      return;
    }

    setAnchor(dayIso);
    onStartChange(dayIso);
    onEndChange(dayIso);
    setDragging(true);
    setMoved(false);
    setAwaitingEnd(true);
  }

  function extendSelection(dayIso: string) {
    if (!dragging || !anchor) return;
    setRange(anchor, dayIso);
    if (dayIso !== anchor) setMoved(true);
  }

  function finishSelection() {
    if (!dragging) return;
    setDragging(false);
    if (moved || awaitingEnd) setAwaitingEnd(false);
  }

  const start = parseIso(rangeStart);
  const end = parseIso(rangeEnd);

  return (
    <div className={styles.calendar} onMouseLeave={() => { if (dragging) setMoved(true); }}>
      <div className={styles.top}>
        <div>
          <span>SELECT RANGE</span>
          <small>{awaitingEnd ? 'Choose the end date, or drag across the range.' : 'Click a start date, then an end date — or click and drag.'}</small>
        </div>
        <div className={styles.nav}>
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
          <strong>{viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className={styles.weekdays}>
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className={styles.days}>
        {days.map(day => {
          const dayIso = iso(day);
          const outside = day.getMonth() !== viewMonth.getMonth();
          const isStart = dayIso === rangeStart;
          const isEnd = dayIso === rangeEnd;
          const inRange = day >= start && day <= end;
          const classes = [
            outside ? styles.outside : '',
            inRange ? styles.inRange : '',
            isStart ? styles.rangeStart : '',
            isEnd ? styles.rangeEnd : '',
          ].filter(Boolean).join(' ');

          return (
            <button
              type="button"
              key={dayIso}
              className={classes}
              onMouseDown={e => {
                e.preventDefault();
                beginSelection(dayIso);
              }}
              onMouseEnter={() => extendSelection(dayIso)}
              onMouseUp={finishSelection}
            >{day.getDate()}</button>
          );
        })}
      </div>
      <div className={styles.bottom}>
        <button type="button" className={styles.today} onClick={() => {
          const today = iso(new Date());
          onStartChange(today);
          onEndChange(today);
          setViewMonth(monthStart(today));
          setAwaitingEnd(true);
        }}>Today</button>
        <span>{rangeStart} → {rangeEnd}</span>
      </div>
    </div>
  );
}
