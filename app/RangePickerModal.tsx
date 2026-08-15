'use client';

import RangeCalendar from './RangeCalendar';
import styles from './RangePickerModal.module.css';

type Status = 'PRESENT' | 'OFF' | 'LEAVE' | 'OB' | 'ABSENT' | 'UNRECORDED';
type DurationUnit = 'days' | 'weeks' | 'months';

type Assignment = {
  employeeKey: string;
  personName: string;
  status: Status;
  leaveType?: string;
  startDate: string;
  endDate: string;
};

type Props = {
  assignment: Assignment;
  durationValue: string;
  durationUnit: DurationUnit;
  dayCount: number;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  onDurationValueChange: (value: string) => void;
  onDurationUnitChange: (value: DurationUnit) => void;
  onSetEndDate: () => void;
  onCancel: () => void;
  onApply: () => void;
};

export default function RangePickerModal({
  assignment,
  durationValue,
  durationUnit,
  dayCount,
  onStartChange,
  onEndChange,
  onDurationValueChange,
  onDurationUnitChange,
  onSetEndDate,
  onCancel,
  onApply,
}: Props) {
  return (
    <div className={styles.backdrop} onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-label="Select date range">
        <div className={styles.header}>
          <div>
            <strong>Select date range</strong>
            <span>{assignment.personName} · {assignment.status === 'LEAVE' ? assignment.leaveType : assignment.status}</span>
          </div>
          <button type="button" onClick={onCancel} aria-label="Close">×</button>
        </div>

        <div className={styles.body}>
          <div className={styles.dateInputs}>
            <label>
              <span>START DATE</span>
              <input type="date" value={assignment.startDate} onChange={e => onStartChange(e.target.value)} />
            </label>
            <label>
              <span>END DATE</span>
              <input type="date" min={assignment.startDate} value={assignment.endDate} onChange={e => onEndChange(e.target.value)} />
            </label>
          </div>

          <div className={styles.calendars}>
            <RangeCalendar
              label="START"
              value={assignment.startDate}
              rangeStart={assignment.startDate}
              rangeEnd={assignment.endDate}
              onChange={onStartChange}
            />
            <RangeCalendar
              label="END"
              value={assignment.endDate}
              min={assignment.startDate}
              rangeStart={assignment.startDate}
              rangeEnd={assignment.endDate}
              onChange={onEndChange}
            />
          </div>

          <div className={styles.durationTool}>
            <div>
              <span>OR ENTER DURATION</span>
              <small>Useful for long leaves such as maternity leave.</small>
            </div>
            <input type="number" min="1" placeholder="e.g. 105" value={durationValue} onChange={e => onDurationValueChange(e.target.value)} />
            <select value={durationUnit} onChange={e => onDurationUnitChange(e.target.value as DurationUnit)}>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
            <button type="button" onClick={onSetEndDate}>Set end date</button>
          </div>

          <div className={styles.preview}>
            <span>{assignment.startDate}</span>
            <b>→</b>
            <span>{assignment.endDate}</span>
            <strong>{dayCount} day{dayCount === 1 ? '' : 's'}</strong>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className={styles.primary} onClick={onApply}>Apply date range</button>
        </div>
      </section>
    </div>
  );
}
