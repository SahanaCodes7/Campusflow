import React, { useEffect, useState } from "react";
import io from 'socket.io-client';

export default function Dashboard() {
  const [counts, setCounts] = useState({ assignments: 0, alerts: 0, announcements: 0 });
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    // load initial data
    fetch('http://localhost:3000/api/data')
      .then(res => res.json())
      .then(data => {
        setCounts({
          assignments: (data.assignments || []).length,
          alerts: (data.alerts || []).length,
          announcements: (data.announcements || []).length,
        });

        // build a simple recent activity list from alerts + announcements
        const combined = [];
        (data.alerts || []).forEach(a => combined.push({ type: 'alert', title: a.title || a.message, datetime: a.timestamp || a.datetime || new Date().toISOString() }));
        (data.announcements || []).forEach(a => combined.push({ type: 'announcement', title: a.title || a.message, datetime: a.timestamp || a.datetime || new Date().toISOString() }));
        combined.sort((x,y) => new Date(y.datetime) - new Date(x.datetime));
        setRecent(combined.slice(0,8));
      })
      .catch(err => console.error('Failed to load dashboard data', err));

    // socket for realtime updates
    const socket = io('http://localhost:3000');

    const refreshCounts = (kind, payload) => {
      setCounts(prev => {
        const next = { ...prev };
        if (kind === 'announcement') next.announcements = (prev.announcements || 0) + 1;
        if (kind === 'alert') next.alerts = (prev.alerts || 0) + 1;
        if (kind === 'assignment') next.assignments = (prev.assignments || 0) + 1;
        return next;
      });

      setRecent(prev => [{ type: kind, title: payload.title || payload.message || 'New update', datetime: payload.timestamp || payload.datetime || new Date().toISOString() }, ...prev].slice(0,8));
    };

    socket.on('announcement', (payload) => refreshCounts('announcement', payload));
    socket.on('alert', (payload) => refreshCounts('alert', payload));
    socket.on('assignment', (payload) => refreshCounts('assignment', payload));
    socket.on('sync-complete', () => {
      // re-fetch to correct counts if needed
      fetch('http://localhost:3000/api/data')
        .then(res => res.json())
        .then(data => setCounts({ assignments: (data.assignments || []).length, alerts: (data.alerts || []).length, announcements: (data.announcements || []).length }))
        .catch(() => {});
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-semibold mb-4">Welcome back!</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Assignments</div>
          <div className="text-3xl font-bold">{counts.assignments}</div>
          <div className="text-sm text-gray-400">Active assignments</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Alerts</div>
          <div className="text-3xl font-bold">{counts.alerts}</div>
          <div className="text-sm text-gray-400">New notifications</div>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-500">Announcements</div>
          <div className="text-3xl font-bold">{counts.announcements}</div>
          <div className="text-sm text-gray-400">Recent updates</div>
        </div>
      </div>

      <div className="mt-6 bg-white rounded-lg shadow p-4">
        <h3 className="font-semibold mb-3">Recent Activity</h3>
        {recent.length === 0 ? (
          <p className="text-gray-500">No recent activity</p>
        ) : (
          <div className="space-y-3">
            {recent.map((r, i) => (
              <div key={i} className="p-3 border-l-4 border-red-200 bg-white rounded">
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-gray-400">{new Date(r.datetime).toLocaleString()}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
