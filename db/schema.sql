CREATE TABLE IF NOT EXISTS attendance (
  id BIGSERIAL PRIMARY KEY,
  employee_key TEXT NOT NULL,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PRESENT','OFF','LEAVE','OB','ABSENT','UNRECORDED')),
  leave_type TEXT,
  camp_at_time TEXT NOT NULL,
  office_at_time TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_key, attendance_date)
);

CREATE INDEX IF NOT EXISTS attendance_date_idx ON attendance (attendance_date);
CREATE INDEX IF NOT EXISTS attendance_office_date_idx ON attendance (camp_at_time, office_at_time, attendance_date);
