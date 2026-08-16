import './globals.css';
import SaveProgressMonitor from './SaveProgressMonitor';

export const metadata = {
  title: 'NBP Attendance Center',
  description: 'Weekly office attendance monitoring for NBP'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <SaveProgressMonitor />
      </body>
    </html>
  );
}
