import React, { useEffect, useState } from "react";
import { CalendarDays, FileText } from "lucide-react";
import io from 'socket.io-client';

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState([]);

  useEffect(() => {
    const BACKEND = 'http://localhost:3000';
    const fetchAssignments = () => {
      fetch(`${BACKEND}/assignments`)
        .then((res) => res.json())
        .then((data) => setAssignments(Array.isArray(data) ? data : (data.assignments || [])))
        .catch(err => console.error('Error fetching assignments:', err));
    };

    fetchAssignments();

    // Socket to refresh when new announcements/alerts/assignments arrive
    const socket = io(BACKEND);
    socket.on('announcement', () => fetchAssignments());
    socket.on('alert', () => fetchAssignments());

    return () => socket.disconnect();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6 text-indigo-700">Assignments</h1>
      {assignments.map((a, i) => (
        <div key={i} className="bg-indigo-50 p-4 mb-4 rounded-xl shadow-sm border border-indigo-100">
          <h2 className="text-lg font-semibold text-indigo-800 flex items-center gap-2">
            <FileText size={18}/> {a.title}
          </h2>
          <p className="text-sm text-gray-700 flex items-center gap-2 mt-1">
            <CalendarDays size={16}/> Deadline: {new Date(a.deadline).toLocaleString()}
          </p>
          <p className="text-sm mt-2 text-gray-600">Status: <b>{a.status}</b></p>
          {a.description && <p className="text-sm mt-2 text-gray-700">{a.description}</p>}
          {a.attachmentUrl && (
            <p className="mt-2">
              {(() => {
                const url = a.attachmentUrl;
                let href = url;
                if (!url.startsWith('http')) {
                  if (url.startsWith('/')) {
                    href = `${window.location.origin}${url}`;
                  } else {
                    // fallback to ExternalApp origin
                    href = `http://localhost:4000/${url}`;
                  }
                }
                return (<a href={href} target="_blank" rel="noreferrer" className="text-indigo-600">📎 View Attachment</a>);
              })()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
