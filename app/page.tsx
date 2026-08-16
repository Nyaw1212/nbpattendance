'use client';

import { useEffect, useMemo, useState } from 'react';
import RangePickerModal from './RangePickerModal';

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
type Status = 'PRESENT' | 'OFF' | 'LEAVE' | 'OB' | 'ABSENT' | 'UNRECORDED' | 'ACT' | 'TRN' | 'UI' | 'AWOL' | 'AWA' | 'SUS' | 'DET' | 'DEC' | 'DIS' | 'RET';
type Cell = { status: Status; leaveType?: string };
type CellPicker = { person: Personnel; day: Date } | null;
type RangeAssignment = {
  employeeKey: string;
  personName: string;
  status: Status;
  leaveType?: string;
  startDate: string;
  endDate: string;
};
type RangePicker = RangeAssignment | null;
type DurationUnit = 'days' | 'weeks' | 'months';
type PersonnelStatusOption = { code: Status; label: string };

const STATUS_ORDER: Status[] = ['PRESENT', 'OFF', 'LEAVE', 'OB', 'ABSENT', 'UNRECORDED'];
const LABEL: Record<Status, string> = {
  PRESENT: 'P', OFF: 'O', LEAVE: 'L', OB: 'OB', ABSENT: 'A', UNRECORDED: '—',
  ACT: 'ACT', TRN: 'TRN', UI: 'UI', AWOL: 'AWOL', AWA: 'AWA', SUS: 'SUS', DET: 'DET', DEC: 'DEC', DIS: 'DIS', RET: 'RET',
};
const PERSONNEL_STATUSES: PersonnelStatusOption[] = [
  { code: 'ACT', label: 'Active / On Duty' },
  { code: 'OB', label: 'Official Business' },
  { code: 'TRN', label: 'In Training' },
  { code: 'UI', label: 'Under Investigation' },
  { code: 'AWOL', label: 'AWOL' },
  { code: 'AWA', label: 'AWA' },
  { code: 'SUS', label: 'On Suspension' },
  { code: 'DET', label: 'Detained' },
  { code: 'DEC', label: 'Deceased' },
  { code: 'DIS', label: 'Dismissed' },
  { code: 'RET', label: 'Retired' },
];

function iso(d: Date) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
function parseIso(value: string) { return new Date(`${value}T12:00:00`); }
function weekFrom(value: string) { const source = parseIso(value); const sunday = new Date(source); sunday.setDate(source.getDate() - source.getDay()); return Array.from({ length: 7 }, (_, i) => { const d = new Date(sunday); d.setDate(sunday.getDate() + i); return d; }); }
function datesBetween(startDate: string, endDate: string) { const start = parseIso(startDate); const end = parseIso(endDate); if (end < start) return []; const out: string[] = []; const d = new Date(start); while (d <= end) { out.push(iso(d)); d.setDate(d.getDate() + 1); } return out; }
function addDuration(startDate: string, amount: number, unit: DurationUnit) { const d = parseIso(startDate); const safeAmount = Math.max(1, Math.floor(amount || 1)); if (unit === 'days') d.setDate(d.getDate() + safeAmount - 1); if (unit === 'weeks') d.setDate(d.getDate() + safeAmount * 7 - 1); if (unit === 'months') { const originalDay = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + safeAmount); d.setDate(Math.min(originalDay, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); d.setDate(d.getDate() - 1); } return iso(d); }
function key(employeeKey: string, date: string) { return `${employeeKey}|${date}`; }
function defaultStatus(dayIndex: number): Status { return dayIndex === 0 || dayIndex === 6 ? 'OFF' : 'PRESENT'; }
function leaveCode(value?: string) { if (!value) return 'L'; const match = value.match(/\(([^)]+)\)/); if (match?.[1]) return match[1].toUpperCase(); const words = value.trim().split(/\s+/).filter(Boolean); if (words.length === 1) return words[0].slice(0, 3).toUpperCase(); return words.map(w => w[0]).join('').slice(0, 3).toUpperCase(); }
function caseLabel(cell: Cell) { if (cell.status === 'LEAVE') return cell.leaveType ? leaveCode(cell.leaveType) : 'LEAVE'; return LABEL[cell.status] || cell.status; }

export default function Home() {
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<string[]>([]);
  const [date, setDate] = useState(iso(new Date()));
  const [activeDay, setActiveDay] = useState(iso(new Date()));
  const [camp, setCamp] = useState('');
  const [office, setOffice] = useState('');
  const [search, setSearch] = useState('');
  const [cells, setCells] = useState<Record<string, Cell>>({});
  const [message, setMessage] = useState('Loading reference data...');
  const [busy, setBusy] = useState(false);
  const [leavePicker, setLeavePicker] = useState<CellPicker>(null);
  const [statusPicker, setStatusPicker] = useState<CellPicker>(null);
  const [rangePicker, setRangePicker] = useState<RangePicker>(null);
  const [pendingRanges, setPendingRanges] = useState<RangeAssignment[]>([]);
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days');

  const week = useMemo(() => weekFrom(date), [date]);
  const camps = useMemo(() => [...new Set(offices.map(o => o.camp))], [offices]);
  const officeOptions = useMemo(() => offices.filter(o => o.camp === camp).sort((a, b) => a.sortOrder - b.sortOrder), [offices, camp]);
  const officeRoster = useMemo(() => personnel.filter(p => p.camp === camp && p.office === office), [personnel, camp, office]);
  const roster = useMemo(() => officeRoster.filter(p => !search || p.fullName.toLowerCase().includes(search.toLowerCase()) || p.badgeNumber.includes(search)).sort((a, b) => a.fullName.localeCompare(b.fullName)), [officeRoster, search]);
  const activeDate = useMemo(() => parseIso(activeDay), [activeDay]);
  const abnormalCases = useMemo(() => officeRoster.map(person => ({ person, cell: cells[key(person.badgeNumber, activeDay)] || { status: 'UNRECORDED' as Status } })).filter(item => item.cell.status !== 'PRESENT' && item.cell.status !== 'OFF' && item.cell.status !== 'ACT').sort((a, b) => a.cell.status.localeCompare(b.cell.status) || a.person.fullName.localeCompare(b.person.fullName)), [officeRoster, cells, activeDay]);
  const abnormalCounts = useMemo(() => { const counts = { LEAVE: 0, OB: 0, ABSENT: 0, UNRECORDED: 0 }; abnormalCases.forEach(({ cell }) => { if (cell.status in counts) counts[cell.status as keyof typeof counts]++; }); return counts; }, [abnormalCases]);

  useEffect(() => { fetch('/api/reference').then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Unable to load reference data.'); setPersonnel(data.personnel || []); setOffices(data.offices || []); setLeaveTypes(data.leaveTypes || []); setMessage(`${data.personnel?.length || 0} personnel available.`); const firstCamp = data.offices?.[0]?.camp || ''; setCamp(firstCamp); setOffice(data.offices?.find((x: Office) => x.camp === firstCamp)?.office || ''); }).catch(e => setMessage(e.message)); }, []);
  useEffect(() => { setActiveDay(date); }, [date]);
  useEffect(() => { if (!camp || !office) return; loadWeek(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [camp, office, date, personnel.length]);

  function overlayPendingRanges(base: Record<string, Cell>) { const next = { ...base }; for (const assignment of pendingRanges) for (const day of datesBetween(assignment.startDate, assignment.endDate)) next[key(assignment.employeeKey, day)] = { status: assignment.status, leaveType: assignment.leaveType }; return next; }

  async function loadWeek() {
    if (!camp || !office || !personnel.length) return;
    const seeded: Record<string, Cell> = {};
    officeRoster.forEach(p => week.forEach((d, i) => { seeded[key(p.badgeNumber, iso(d))] = { status: defaultStatus(i) }; }));
    setCells(overlayPendingRanges(seeded)); setBusy(true); setMessage(`Loading ${office}...`);
    try {
      const params = new URLSearchParams({ weekStart: iso(week[0]), weekEnd: iso(week[6]), camp, office });
      const r = await fetch(`/api/attendance?${params}`); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Unable to load attendance.');
      const merged = { ...seeded }; for (const rec of data.records || []) merged[key(String(rec.employee_key), String(rec.attendance_date))] = { status: rec.status as Status, leaveType: rec.leave_type || undefined };
      setCells(overlayPendingRanges(merged)); setMessage(`${officeRoster.length} personnel loaded for ${office}.`);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load attendance.'); } finally { setBusy(false); }
  }

  function buildRangePicker(person: Personnel, day: Date, status: Status, leaveType?: string): RangeAssignment {
    const selected = iso(day);
    return { employeeKey: person.badgeNumber, personName: person.fullName, status, leaveType, startDate: selected, endDate: selected };
  }

  function openRangePicker(person: Personnel, day: Date, status: Status, leaveType?: string) {
    setDurationValue('');
    setDurationUnit('days');
    setRangePicker(buildRangePicker(person, day, status, leaveType));
  }

  function openRangeAfterModal(target: NonNullable<CellPicker>, status: Status, leaveType?: string, close: () => void = () => {}) {
    const assignment = buildRangePicker(target.person, target.day, status, leaveType);
    setDurationValue('');
    setDurationUnit('days');
    close();
    window.setTimeout(() => setRangePicker(assignment), 0);
  }

  function cycleCell(person: Personnel, day: Date) { setActiveDay(iso(day)); const k = key(person.badgeNumber, iso(day)); const current = cells[k]?.status || 'UNRECORDED'; const currentIndex = STATUS_ORDER.indexOf(current); const next = STATUS_ORDER[(currentIndex < 0 ? 0 : currentIndex + 1) % STATUS_ORDER.length]; setCells(prev => ({ ...prev, [k]: { status: next, leaveType: next === 'LEAVE' ? prev[k]?.leaveType : undefined } })); }
  function chooseLeaveType(leaveType: string) { if (!leavePicker) return; const { person, day } = leavePicker; const k = key(person.badgeNumber, iso(day)); setCells(prev => ({ ...prev, [k]: { status: 'LEAVE', leaveType } })); setActiveDay(iso(day)); setMessage(`${leaveType} selected for ${person.fullName}. Choose DATE for a range, or close this window to keep it for ${iso(day)} only.`); }
  function choosePersonnelStatus(status: Status, label: string) {
    if (!statusPicker) return;
    const target = statusPicker;
    const { person, day } = target;
    const k = key(person.badgeNumber, iso(day));
    setCells(prev => ({ ...prev, [k]: { status } }));
    setActiveDay(iso(day));
    setMessage(`${label} (${LABEL[status]}) selected for ${person.fullName}. Select the inclusive date range.`);
    openRangeAfterModal(target, status, undefined, () => setStatusPicker(null));
  }
  function applyDuration() { if (!rangePicker || !durationValue) return; const amount = Number(durationValue); if (!Number.isFinite(amount) || amount <= 0) return; setRangePicker(prev => prev ? { ...prev, endDate: addDuration(prev.startDate, amount, durationUnit) } : prev); }
  function applyRange() { if (!rangePicker) return; const days = datesBetween(rangePicker.startDate, rangePicker.endDate); if (!days.length) { setMessage('End date must be the same as or after the start date.'); return; } setCells(prev => { const next = { ...prev }; for (const day of days) next[key(rangePicker.employeeKey, day)] = { status: rangePicker.status, leaveType: rangePicker.leaveType }; return next; }); setPendingRanges(prev => [...prev.filter(r => !(r.employeeKey === rangePicker.employeeKey && r.status === rangePicker.status && r.leaveType === rangePicker.leaveType)), rangePicker]); setActiveDay(rangePicker.startDate); setMessage(`${rangePicker.status === 'LEAVE' ? rangePicker.leaveType || 'Leave' : LABEL[rangePicker.status] || rangePicker.status} applied from ${rangePicker.startDate} to ${rangePicker.endDate}. Save Week to commit.`); setRangePicker(null); }
  function applyPreset() { const next = { ...cells }; officeRoster.forEach(p => week.forEach((d, i) => { next[key(p.badgeNumber, iso(d))] = { status: defaultStatus(i) }; })); setCells(next); setMessage('Normal office-days preset applied.'); }
  function clearWeek() { const next = { ...cells }; officeRoster.forEach(p => week.forEach(d => { next[key(p.badgeNumber, iso(d))] = { status: 'UNRECORDED' }; })); setCells(next); setMessage('Week cleared locally. Save to commit the change.'); }

  async function saveWeek() {
    const byKey = new Map<string, { employeeKey: string; date: string; status: Status; leaveType: string | null; camp: string; office: string }>();
    for (const p of officeRoster) for (const day of week) { const dayIso = iso(day); const c = cells[key(p.badgeNumber, dayIso)] || { status: 'UNRECORDED' as Status }; byKey.set(key(p.badgeNumber, dayIso), { employeeKey: p.badgeNumber, date: dayIso, status: c.status, leaveType: c.leaveType || null, camp, office }); }
    for (const assignment of pendingRanges) for (const dayIso of datesBetween(assignment.startDate, assignment.endDate)) byKey.set(key(assignment.employeeKey, dayIso), { employeeKey: assignment.employeeKey, date: dayIso, status: assignment.status, leaveType: assignment.leaveType || null, camp, office });
    const entries = [...byKey.values()]; setBusy(true); setMessage(`Saving ${entries.length} attendance entries...`);
    try { const r = await fetch('/api/attendance', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Unable to save attendance.'); setPendingRanges([]); setMessage(`${data.saved} attendance entries saved.`); } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save attendance.'); } finally { setBusy(false); }
  }

  function moveWeek(days: number) { const d = parseIso(date); d.setDate(d.getDate() + days); setDate(iso(d)); }

  return <main className="page-shell"><section className="app-card">
    <header className="app-head"><div><h1>Attendance Center</h1><p>Weekly office attendance recorder</p></div></header>
    <div className="controls"><label><span>WEEK CONTAINING</span><input type="date" value={date} onChange={e => setDate(e.target.value)} /></label><label><span>CAMP</span><select value={camp} onChange={e => { setCamp(e.target.value); setOffice(''); }}><option value="">Select camp</option>{camps.map(c => <option key={c}>{c}</option>)}</select></label><label><span>OFFICE</span><select value={office} onChange={e => setOffice(e.target.value)}><option value="">Select office</option>{officeOptions.map(o => <option key={o.office}>{o.office}</option>)}</select></label><label><span>DUTY PRESET</span><select><option>Normal Office Days</option></select></label><button className="primary" onClick={loadWeek} disabled={busy}>Load Week</button><button onClick={applyPreset} disabled={busy || !office}>Apply Preset</button></div>

    <section className="daily-focus"><div className="abnormal-panel"><div className="abnormal-head"><div><span>SUMMARY OF PERSONNEL STATUSES / MOVEMENT</span><strong>{activeDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong></div><div className="case-count">{abnormalCases.length}</div></div><div className="case-chips"><span>Leave <b>{abnormalCounts.LEAVE}</b></span><span>OB <b>{abnormalCounts.OB}</b></span><span>Absent <b>{abnormalCounts.ABSENT}</b></span><span>Unrecorded <b>{abnormalCounts.UNRECORDED}</b></span></div><div className="case-list">{abnormalCases.length === 0 ? <div className="no-cases">No personnel statuses or movements to show for this day.</div> : abnormalCases.map(({ person, cell }) => <div className="case-row" key={person.badgeNumber}><div><b>{person.fullName}</b><small>{person.rank} · Badge {person.badgeNumber}</small></div><span className={`case-status case-${cell.status.toLowerCase()}`} title={cell.leaveType || cell.status}>{caseLabel(cell)}</span></div>)}</div></div></section>

    <div className="toolbar"><button onClick={() => moveWeek(-7)}>‹ Previous</button><strong>{week[0].toLocaleDateString()} – {week[6].toLocaleDateString()}</strong><button onClick={() => moveWeek(7)}>Next ›</button><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search personnel..." /><span className="hint">P → O → L → OB → A → — · ⋯ = details / status</span><button onClick={clearWeek}>Clear Week</button></div>

    <div className="grid-wrap">{!office ? <div className="empty">Select a camp and office.</div> : <table className="attendance-grid"><thead><tr><th>Personnel</th>{week.map(d => <th key={iso(d)} className={iso(d) === activeDay ? 'active-day-column' : ''}><button className="day-head-button" onClick={() => setActiveDay(iso(d))}><span>{d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</span><small>{d.getMonth() + 1}/{d.getDate()}</small></button></th>)}</tr></thead><tbody>{roster.map(p => <tr key={p.badgeNumber}><td><b>{p.fullName}</b><small>{p.rank} · Badge {p.badgeNumber || '—'}</small></td>{week.map(day => { const c = cells[key(p.badgeNumber, iso(day))] || { status: 'UNRECORDED' as Status }; const display = c.status === 'LEAVE' ? leaveCode(c.leaveType) : (LABEL[c.status] || c.status); const hasDetails = c.status !== 'PRESENT' && c.status !== 'OFF'; return <td key={iso(day)} className={iso(day) === activeDay ? 'active-day-cell' : ''}><div className="status-cell"><button className={`status status-${c.status.toLowerCase()} ${display.length > 2 ? 'status-wide' : ''}`} onClick={() => cycleCell(p, day)}>{display}</button>{hasDetails && <button className="details-trigger" title="Details / personnel status" aria-label={`Details for ${p.fullName}`} onClick={() => { setActiveDay(iso(day)); if (c.status === 'LEAVE') setLeavePicker({ person: p, day }); else setStatusPicker({ person: p, day }); }}>⋯</button>}</div></td>; })}</tr>)}</tbody></table>}</div>

    <footer><span>{message}{pendingRanges.length ? ` · ${pendingRanges.length} range${pendingRanges.length === 1 ? '' : 's'} pending` : ''}</span><button className="primary" onClick={saveWeek} disabled={busy || !office}>Save Week</button></footer>
  </section>

  {leavePicker && (() => { const current = cells[key(leavePicker.person.badgeNumber, iso(leavePicker.day))] || { status: 'LEAVE' as Status }; return <div className="picker-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setLeavePicker(null); }}><section className="leave-picker" role="dialog" aria-modal="true" aria-label="Leave details"><div className="picker-head"><div><strong>Leave details</strong><span>{leavePicker.person.fullName} · {leavePicker.day.toLocaleDateString()}</span></div><button onClick={() => setLeavePicker(null)} aria-label="Close">×</button></div><div className="leave-options"><button onClick={() => openRangeAfterModal(leavePicker, 'LEAVE', current.leaveType, () => setLeavePicker(null))}><b>DATE</b><span>Set date range{current.leaveType ? ` for ${leaveCode(current.leaveType)}` : ''}</span></button><button onClick={() => { const target = leavePicker; setLeavePicker(null); setStatusPicker(target); }}><b>STS</b><span>Personnel status</span></button>{leaveTypes.length ? leaveTypes.map(type => <button key={type} onClick={() => chooseLeaveType(type)}><b>{leaveCode(type)}</b><span>{type}</span></button>) : <p>No leave types configured.</p>}</div></section></div>; })()}

  {statusPicker && (() => { return <div className="picker-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setStatusPicker(null); }}><section className="leave-picker" role="dialog" aria-modal="true" aria-label="Select personnel status"><div className="picker-head"><div><strong>Select personnel status</strong><span>{statusPicker.person.fullName} · {statusPicker.day.toLocaleDateString()}</span></div><button onClick={() => setStatusPicker(null)} aria-label="Close">×</button></div><div className="leave-options">{PERSONNEL_STATUSES.map(option => <button key={option.code} onClick={() => choosePersonnelStatus(option.code, option.label)}><b>{option.code}</b><span>{option.label}</span></button>)}</div></section></div>; })()}

  {rangePicker && <RangePickerModal assignment={rangePicker} durationValue={durationValue} durationUnit={durationUnit} dayCount={datesBetween(rangePicker.startDate, rangePicker.endDate).length} onStartChange={value => setRangePicker(prev => prev ? { ...prev, startDate: value, endDate: value > prev.endDate ? value : prev.endDate } : prev)} onEndChange={value => setRangePicker(prev => prev ? { ...prev, endDate: value } : prev)} onDurationValueChange={setDurationValue} onDurationUnitChange={setDurationUnit} onSetEndDate={applyDuration} onCancel={() => setRangePicker(null)} onApply={applyRange} />}
  </main>;
}
