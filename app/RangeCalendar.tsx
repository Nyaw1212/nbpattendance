'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  label: string;
  value: string;
  rangeStart: string;
  rangeEnd: string;
  min?: string;
  onChange: (value: string) => void;
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

export default function RangeCalendar({ label, value, rangeStart, rangeEnd, min, onChange }: Props) {
  const [viewMonth, setViewMonth] = useState(() => monthStart(value));

  useEffect(() => {
    setViewMonth(monthStart(value));
  }, [value]);

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

  const minDate = min ? parseIso(min) : null;
  const start = parseIso(rangeStart);
  const end = parseIso(rangeEnd);

  return (
    <div className="inline-calendar">
      <div className="inline-calendar-top">
        <span>{label}</span>
        <div className="calendar-nav">
          <button type="button" onClick={() => moveMonth(-1)} aria-label="Previous month">‹</button>
          <strong>{viewMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <button type="button" onClick={() => moveMonth(1)} aria-label="Next month">›</button>
        </div>
      </div>
      <div className="calendar-weekdays">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {days.map(day => {
          const dayIso = iso(day);
          const outside = day.getMonth() !== viewMonth.getMonth();
          const selected = dayIso === value;
          const inRange = day >= start && day <= end;
          const disabled = !!minDate && day < minDate;
          return (
            <button
              type="button"
              key={dayIso}
              disabled={disabled}
              className={`${outside ? 'outside' : ''} ${inRange ? 'in-range' : ''} ${selected ? 'selected' : ''}`}
              onClick={() => onChange(dayIso)}
            >{day.getDate()}</button>
          );
        })}
      </div>
      <button type="button" className="calendar-today" onClick={() => {
        const today = iso(new Date());
        if (!min || today >= min) onChange(today);
      }}>Today</button>
    </div>
  );
}
