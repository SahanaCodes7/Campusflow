import { useEffect, useState } from "react";
import { ClipboardList, Bell, RefreshCcw, LayoutDashboard, Megaphone } from "lucide-react";
import { NavLink } from "react-router-dom";
import axios from "axios";
import io from 'socket.io-client';

export default function Sidebar() {
  const [connected, setConnected] = useState(false);
  const [counts, setCounts] = useState({ announcements: 0, alerts: 0, assignments: 0 });

  // 🔗 Check CampusFlow backend connection (and indirectly CollegeConnect)
  useEffect(() => {
    const BACKEND = 'http://localhost:3000';

    const checkConnection = async () => {
      try {
        await axios.get(`${BACKEND}/health`);
        setConnected(true);
      } catch (err) {
        setConnected(false);
      }
    };

    // fetch initial counts
    const fetchCounts = async () => {
      try {
        const d = await axios.get(`${BACKEND}/api/data`);
        const a = await axios.get(`${BACKEND}/assignments`);
        setCounts({ announcements: (d.data.announcements||[]).length, alerts: (d.data.alerts||[]).length, assignments: (Array.isArray(a.data) ? a.data.length : (a.data.assignments||[]).length) });
      } catch (e) {
        // ignore
      }
    };

    checkConnection();
    fetchCounts();

    const interval = setInterval(() => { checkConnection(); fetchCounts(); }, 10000); // refresh every 10s

    // Setup socket to update counters live
    const socket = io('http://localhost:3000');
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('announcement', (item) => {
      setCounts(prev => ({ ...prev, announcements: (prev.announcements||0) + 1 }));
    });
    socket.on('alert', (item) => {
      setCounts(prev => ({ ...prev, alerts: (prev.alerts||0) + 1 }));
    });
    socket.on('sync-complete', () => {
      // re-fetch to stay consistent
      fetchCounts();
    });

    return () => { clearInterval(interval); socket.disconnect(); };
  }, []);

  const linkClasses =
    "flex items-center gap-2 p-2 rounded-md transition-all duration-200 hover:bg-indigo-100 hover:text-indigo-800";
  const activeClasses = "bg-indigo-200 text-indigo-900 font-semibold";

  return (
    <div className="w-64 bg-gradient-to-b from-indigo-50 to-indigo-100 h-screen shadow-lg p-5 border-r border-indigo-200 flex flex-col">
      {/* ===== HEADER ===== */}
      <h2 className="text-2xl font-extrabold mb-8 text-indigo-700 tracking-wide flex items-center gap-2">
        🎓 CampusFlow
      </h2>

      {/* ===== NAVIGATION ===== */}
      <nav className="flex flex-col space-y-3">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? activeClasses : "text-indigo-700"}`
          }
        >
          <LayoutDashboard size={18} /> Dashboard
        </NavLink>

        <NavLink
          to="/alerts"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? activeClasses : "text-indigo-700"}`
          }
        >
          <Bell size={18} /> Alerts <span className="ml-auto text-sm font-semibold text-red-600">{counts.alerts}</span>
        </NavLink>

        <NavLink
          to="/assignments"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? activeClasses : "text-indigo-700"}`
          }
        >
          <ClipboardList size={18} /> Assignments <span className="ml-auto text-sm font-semibold text-indigo-700">{counts.assignments}</span>
        </NavLink>

        <NavLink
          to="/updates"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? activeClasses : "text-indigo-700"}`
          }
        >
          <Megaphone size={18} /> Updates <span className="ml-auto text-sm font-semibold text-blue-600">{counts.announcements}</span>
        </NavLink>

        <NavLink
          to="/sync"
          className={({ isActive }) =>
            `${linkClasses} ${isActive ? activeClasses : "text-indigo-700"}`
          }
        >
          <RefreshCcw size={18} /> Sync
        </NavLink>
      </nav>

      {/* ===== FOOTER STATUS ===== */}
      <div className="mt-auto pt-8 text-sm text-indigo-500 border-t border-indigo-200 flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              connected ? "bg-green-500 animate-pulse" : "bg-red-500"
            }`}
          ></span>
          <span>{connected ? "Connected to CollegeConnect" : "Not Connected"}</span>
        </div>
        <p className="text-xs text-indigo-400 mt-1">© 2025 CampusFlow</p>
      </div>
    </div>
  );
}
