import { useEffect, useState } from 'react';
import TopBar from './components/layout/TopBar.jsx';
import Sidebar from './components/layout/Sidebar.jsx';
import Dashboard from './components/dashboard/Dashboard.jsx';
import CalendarView from './components/calendar/CalendarView.jsx';
import DailyPlanner from './components/planner/DailyPlanner.jsx';
import NoteStudio from './components/notes/NoteStudio.jsx';
import RemindersPage from './components/reminders/RemindersPage.jsx';
import SettingsPage from './components/settings/SettingsPage.jsx';
import StudyForTestModal from './components/notes/StudyForTestModal.jsx';
import SearchModal from './components/search/SearchModal.jsx';

export default function App() {
  const [activeView, setActiveView] = useState('dashboard');
  const [showStudyModal, setShowStudyModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [pendingNoteId, setPendingNoteId] = useState(null);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowSearch(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  function openNoteFromSearch(noteId) {
    setActiveView('notes');
    setPendingNoteId(noteId);
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-base-bg">
      <TopBar />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          onSearch={() => setShowSearch(true)}
          onStudyMode={() => setShowStudyModal(true)}
        />
        <main className="flex-1 overflow-hidden flex flex-col">
          {activeView === 'dashboard' && <Dashboard onNavigate={setActiveView} />}
          {activeView === 'calendar' && <CalendarView />}
          {activeView === 'planner' && <DailyPlanner />}
          {activeView === 'notes' && (
            <NoteStudio
              openNoteId={pendingNoteId}
              onOpened={() => setPendingNoteId(null)}
              onOpenStudyModal={() => setShowStudyModal(true)}
            />
          )}
          {activeView === 'reminders' && <RemindersPage />}
          {activeView === 'settings' && <SettingsPage />}
        </main>
      </div>
      {showStudyModal && <StudyForTestModal onClose={() => setShowStudyModal(false)} />}
      {showSearch && <SearchModal onClose={() => setShowSearch(false)} onOpenNote={openNoteFromSearch} />}
    </div>
  );
}
