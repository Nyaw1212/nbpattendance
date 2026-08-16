'use client';

import { useEffect, useState } from 'react';
import styles from './SaveProgressMonitor.module.css';

type SaveState = {
  visible: boolean;
  phase: 'saving' | 'success' | 'error';
  total: number;
  message: string;
};

const INITIAL: SaveState = {
  visible: false,
  phase: 'saving',
  total: 0,
  message: '',
};

export default function SaveProgressMonitor() {
  const [state, setState] = useState<SaveState>(INITIAL);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    let hideTimer: number | undefined;

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const isAttendanceSave = method === 'POST' && url.includes('/api/attendance');

      if (!isAttendanceSave) return originalFetch(input, init);

      let total = 0;
      try {
        if (typeof init?.body === 'string') {
          const payload = JSON.parse(init.body);
          total = Array.isArray(payload?.entries) ? payload.entries.length : 0;
        }
      } catch {
        total = 0;
      }

      if (hideTimer) window.clearTimeout(hideTimer);
      setState({
        visible: true,
        phase: 'saving',
        total,
        message: total ? `Saving ${total} attendance entries…` : 'Saving attendance entries…',
      });

      try {
        const response = await originalFetch(input, init);
        if (!response.ok) {
          setState({ visible: true, phase: 'error', total, message: 'Save failed. Please check the message at the bottom of the page.' });
          return response;
        }

        setState({
          visible: true,
          phase: 'success',
          total,
          message: total ? `${total} attendance entries saved.` : 'Attendance saved successfully.',
        });
        hideTimer = window.setTimeout(() => setState(INITIAL), 1800);
        return response;
      } catch (error) {
        setState({ visible: true, phase: 'error', total, message: 'Unable to save attendance. Please try again.' });
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!state.visible) return null;

  return (
    <div className={styles.toast} role="status" aria-live="polite">
      <div className={styles.header}>
        <div>
          <strong>{state.phase === 'saving' ? 'Saving attendance' : state.phase === 'success' ? 'Save complete' : 'Save problem'}</strong>
          <span>{state.message}</span>
        </div>
        <div className={`${styles.icon} ${styles[state.phase]}`} aria-hidden="true">
          {state.phase === 'saving' ? '↥' : state.phase === 'success' ? '✓' : '!'}
        </div>
      </div>

      {state.phase === 'saving' ? (
        <>
          <div className={styles.track}><div className={styles.indeterminate} /></div>
          <small>Please keep this page open while the attendance is being saved.</small>
        </>
      ) : (
        <div className={`${styles.track} ${styles.completeTrack}`}><div className={styles.complete} /></div>
      )}
    </div>
  );
}
