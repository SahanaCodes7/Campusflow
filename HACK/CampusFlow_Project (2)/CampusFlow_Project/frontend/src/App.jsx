import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Sidebar from "./Sidebar";
import Dashboard from "./Dashboard";
import AlertsPage from "./AlertsPage";
import SyncPage from "./SyncPage";
import AssignmentsPage from "./AssignmentsPage";
import UpdatesPage from "./UpdatesPage"; // 🔹 new import

function App() {
  return (
    <Router>
      <div className="flex">
        <Sidebar />
        <div className="flex-1 bg-gray-50 min-h-screen p-4">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/assignments" element={<AssignmentsPage />} />
            <Route path="/sync" element={<SyncPage />} />
            <Route path="/updates" element={<UpdatesPage />} /> {/* 🔹 new route */}
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;
