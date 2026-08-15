'use client';

import { useEffect, useMemo, useState } from 'react';

type Personnel = {
  recordId: string;
  badgeNumber: string;
  rank: string;
  fullName: string;
  camp: string;
  office: string;
  gender: string;
  classification: string;
  personnelType: string;
};

type Office = { camp: string; office: string; sortOrder: number };
type Status = 'PRESENT' | 'OFF' | 'LEAVE' | 'OB' | 'ABSENT' | 'UNRECORDED';
type Cell = { status: Status; leaveType?: string };
type LeavePicker = { employeeKey: string; day: Date; personName: string } | null;

const STATUS_ORDER: Status[] = ['PRESENT', 'OFF', 'LEAVE', 'OB', 'ABSENT', 'UNRECORDED'];
const LABEL: Record<Status, string> = { PRESENT: 'P', OFF: 'O', LEAVE: 'L', OB: 'OB', ABSENT: 'A', UNRECORDED: '—' };

function iso(d: Date) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function weekFrom(value: string) {
  const source = new Date(`${value}T12:00:00`);
  const sunday = new Date(source);
  sunday.setDate(source.getDate() - source.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    return d;
  });
}

function key(employeeKey: string, date: string) {
  return `${employeeKey}|${date}`;
}

function defaultStatus(dayIndex: number): Status {
  return dayIndex === 0 || dayIndex === 6 ? 'OFF' : 'PRESENT';
}

function leaveCode(value?: string) {
  if (!value) return 'L';
  const match = value.match(/\(([^)]+)\)/);
  if (match?.[1]) return match[1].toUpperCase();
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase();
}

export default function Home() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);
  const [date, setDate] = useState(iso(new Date()));
  const [camp, setCamp] = useState('');
  const [office, setOffice] = useState('');
  const [search, setSearch] = useState('');
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [message, setMessage] = useState('Loading reference data...');
  const [busy, setBusy] = useState(false);
  const [leavePicker, setLeavePicker] = useState<LeavePicker>(null);

  const week = useMemo(() => weekFrom(date), [date]);
  const camps = useMemo(() => [...new Set(offices.map(o => o.camp))], [offices]);
  const officeOptions = useMemo(() => offices.filter(o => o.camp === camp).sort((a, b) => a.sortOrder - b.sortOrder), [offices, camp]);
  const roster = useMemo(() => personnel
    .filter(p => p.camp === camp && p.office === office)
    .filter(p => !search || p.fullName.toLowerCase().includes(search.toLowerCase()) || p.badgeNumber.includes(search))
    .sort((a, b) => a.fullName.localeCompare(b.fullName)), [personnel, camp, office, search]);

  useEffect(() => {
    fetch('/api/reference').then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to load reference data.');
      setPersonnel(data.personnel || []);
      setOffices(data.offices || []);
      setLeaveTypes(data.leaveTypes || []);
      setMessage(`${data.personnel?.length || 0} personnel available.`);
      const firstCamp = data.offices?.[0]?.camp || '';
      setCamp(firstCamp);
      const firstOffice = data.offices?.find((x: Office) => x.camp === firstCamp)?.office || '';
      setOffice(firstOffice);
    }).catch(e => setMessage(e.message));
  }, []);

  useEffect(() => {
    if (!camp || !office) return;
    loadWeek();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camp, office, date, personnel.length]);

  async function loadWeek() {
    if (!camp || !office || !personnel.length) return;
    const currentRoster = personnel.filter(p => p.camp === camp && p.office === office);
    const seeded: Record<string, Cell> = {};
    currentRoster.forEach(p => week.forEach((d, i) => seeded[key(p.badgeNumber, iso(d))] = { status: defaultStatus(i) }));
    setCells(seeded);
    setBusy(true);
    setMessage(`Loading ${office}...`);
    try {
      const params = new URLSearchParams({ weekStart: iso(week[0]), weekEnd: iso(week[6]), camp, office });
      const r = await fetch(`/api/attendance?${params}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to load attendance.');
      const merged = { ...seeded };
      for (const rec of data.records || []) {
        merged[key(String(rec.employee_key), String(rec.attendance_date))] = { status: rec.status, leaveType: rec.leave_type || undefined };
      }
      setCells(merged);
      setMessage(`${currentRoster.length} personnel loaded for ${office}.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load attendance.');
    } finally { setBusy(false); }
  }

  function cycleCell(person: Personnel, day: Date) {
    const employeeKey = person.badgeNumber;
    const k = key(employeeKey, iso(day));
    const current = cells[k]?.status || 'UNRECORDED';
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    setCells(prev => ({ ...prev, [k]: { status: next, leaveType: next === 'LEAVE' ? prev[k]?.leaveType : undefined } }));
    if (next === 'LEAVE') setLeavePicker({ employeeKey, day, personName: person.fullName });
  }

  function chooseLeaveType(leaveType: string) {
    if (!leavePicker) return;
    const k = key(leavePicker.employeeKey, iso(leavePicker.day));
    setCells(prev => ({ ...prev, [k]: { status: 'LEAVE', leaveType } }));
    setLeavePicker(null);
  }

  function applyPreset() {
    const next = { ...cells };
    personnel.filter(p => p.camp === camp && p.office === office).forEach(p => week.forEach((d, i) => {
      next[key(p.badgeNumber, iso(d))] = { status: defaultStatus(i) };
    }));
    setCells(next);
    setMessage('Normal office-days preset applied.');
  }

  function clearWeek() {
    const next = { ...cells };
    personnel.filter(p => p.camp === camp && p.office === office).forEach(p => week.forEach(d => {
      next[key(p.badgeNumber, iso(d))] = { status: 'UNRECORDED' };
    }));
    setCells(next);
    setMessage('Week cleared locally. Save to commit the change.');
  }

  async function saveWeek() {
    const currentRoster = personnel.filter(p => p.camp === camp && p.office === office);
    const entries = currentRoster.flatMap(p => week.map(day => {
      const c = cells[key(p.badgeNumber, iso(day))] || { status: 'UNRECORDED' as Status };
      return { employeeKey: p.badgeNumber, date: iso(day), status: c.status, leaveType: c.leaveType || null, camp, office };
    }));
    setBusy(true);
    setMessage(`Saving ${entries.length} attendance cells...`);
    try {
      const r = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Unable to save attendance.');
      setMessage(`${data.saved} attendance cells saved.`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to save attendance.');
    } finally { setBusy(false); }
  }

  const totals = useMemo(() => {
    const out: Record<Status, number> = { PRESENT: 0, OFF: 0, LEAVE: 0, OB: 0, ABSENT: 0, UNRECORDED: 0 };
    personnel.filter(p => p.camp === camp && p.office === office).forEach(p => week.forEach(d => {
      out[(cells[key(p.badgeNumber, iso(d))]?.status || 'UNRECORDED')]++;
    }));
    return out;
  }, [cells, personnel, camp, office, week]);

  function moveWeek(days: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + days);
    setDate(iso(d));
  }

  return (
    <main className="page-shell">
      <section className="app-card">
        <header className="app-head">
          <div><h1>Attendance Center</h1><p>Weekly office attendance recorder</p></div>
        </header>

        <div className="controls">
          <label><span>WEEK CONTAINING</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label><span>CAMP</span><select value={camp} onChange={e => { setCamp(e.target.value); setOffice(''); }}><option value="">Select camp</option>{camps.map(c => <option key={c}>{c}</option>)}</select></label>
          <label><span>OFFICE</span><select value={office} onChange={e => setOffice(e.target.value)}><option value="">Select office</option>{officeOptions.map(o => <option key={o.office}>{o.office}</option>)}</select></label>
          <label><span>DUTY PRESET</span><select><option>Normal Office Days</option></select></label>
          <button className="primary" onClick={loadWeek} disabled={busy}>Load Week</button>
          <button onClick={applyPreset} disabled={busy || !office}>Apply Preset</button>
        </div>

        <div className="summary">
          <Stat label="Personnel" value={personnel.filter(p => p.camp === camp && p.office === office).length} />
          <Stat label="Present" value={totals.PRESENT} />
          <Stat label="Off" value={totals.OFF} />
          <Stat label="Leave" value={totals.LEAVE} />
          <Stat label="OB" value={totals.OB} />
          <Stat label="Absent" value={totals.ABSENT} />
          <Stat label="Unrecorded" value={totals.UNRECORDED} />
        </div>

        <div className="toolbar">
          <button onClick={() => moveWeek(-7)}>‹ Previous</button>
          <strong>{week[0].toLocaleDateString()} – {week[6].toLocaleDateString()}</strong>
          <button onClick={() => moveWeek(7)}>Next ›</button>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search personnel..." />
          <span className="hint">Click: P → O → L → OB → A → —</span>
          <button onClick={clearWeek}>Clear Week</button>
        </div>

        <div className="grid-wrap">
          {!office ? <div className="empty">Select a camp and office.</div> : (
            <table className="attendance-grid">
              <thead><tr><th>Personnel</th>{week.map(d => <th key={iso(d)}>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}<small>{d.getMonth()+1}/{d.getDate()}</small></th>)}</tr></thead>
              <tbody>{roster.map(p => <tr key={p.badgeNumber}>
                <td><b>{p.fullName}</b><small>{p.rank} · Badge {p.badgeNumber || '—'}</small></td>
                {week.map(day => {
                  const c = cells[key(p.badgeNumber, iso(day))] || { status: 'UNRECORDED' as Status };
                  const display = c.status === 'LEAVE' ? leaveCode(c.leaveType) : LABEL[c.status];
                  return <td key={iso(day)}>
                    <button
                      className={`status status-${c.status.toLowerCase()} ${c.status === 'LEAVE' && c.leaveType ? 'status-wide' : ''}`}
                      onClick={() => cycleCell(p, day)}
                      onContextMenu={e => {
                        if (c.status !== 'LEAVE') return;
                        e.preventDefault();
                        setLeavePicker({ employeeKey: p.badgeNumber, day, personName: p.fullName });
                      }}
                      title={c.status === 'LEAVE' && c.leaveType ? `${c.leaveType} · right-click to change leave type` : undefined}
                    >{display}</button>
                  </td>;
                })}
              </tr>)}</tbody>
            </table>
          )}
        </div>

        <footer><span>{message}</span><button className="primary" onClick={saveWeek} disabled={busy || !office}>Save Week</button></footer>
      </section>

      {leavePicker && (
        <div className="picker-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setLeavePicker(null); }}>
          <section className="leave-picker" role="dialog" aria-modal="true" aria-label="Select leave type">
            <div className="picker-head">
              <div><strong>Select leave type</strong><span>{leavePicker.personName} · {leavePicker.day.toLocaleDateString()}</span></div>
              <button onClick={() => setLeavePicker(null)} aria-label="Close">×</button>
            </div>
            <div className="leave-options">
              {leaveTypes.length ? leaveTypes.map(type => (
                <button key={type} onClick={() => chooseLeaveType(type)}><b>{leaveCode(type)}</b><span>{type}</span></button>
              )) : <p>No leave types configured.</p>}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="stat"><span>{label}</span><strong>{value}</strong></div>;
}
