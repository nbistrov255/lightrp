import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Spinner, ToastProvider } from './components/ui';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import TaskDetail from './pages/TaskDetail';
import Shifts from './pages/Shifts';
import Checklist from './pages/Checklist';
import Breakdowns from './pages/Breakdowns';
import Cash from './pages/Cash';
import Bookings from './pages/Bookings';
import Money from './pages/Money';
import Team from './pages/Team';
import Notifications from './pages/Notifications';
import SettingsPage from './pages/Settings';
import More from './pages/More';

function Gate() {
  const { user, loading, isDirector } = useAuth();
  if (loading) return <div className="min-h-dvh grid place-items-center bg-hero"><Spinner /></div>;
  if (!user) return <Login />;
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="tasks/:id" element={<TaskDetail />} />
        <Route path="shifts" element={<Shifts />} />
        <Route path="checklist" element={<Checklist />} />
        <Route path="checklist/:id" element={<Checklist />} />
        <Route path="breakdowns" element={<Breakdowns />} />
        <Route path="cash" element={<Cash />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="money" element={<Money />} />
        {isDirector && <Route path="team" element={<Team />} />}
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="more" element={<More />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
