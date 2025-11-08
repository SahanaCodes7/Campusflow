import React, { useEffect, useState } from "react";
import axios from "axios";
import io from 'socket.io-client';

const Updates = () => {
  const [updates, setUpdates] = useState([]);
  const [announcements, setAnnouncements] = useState([]);

  useEffect(() => {
    // Initial data load
    axios.get("http://localhost:3000/api/data")
      .then(res => {
        setUpdates(res.data.alerts || []);
        setAnnouncements(res.data.announcements || []);
      })
      .catch(err => console.error("Error fetching updates:", err));

    // Socket.io connection for real-time updates
    const socket = io('http://localhost:3000');
    
    socket.on('announcement', (newAnnouncement) => {
      setAnnouncements(prev => [...prev, newAnnouncement]);
    });

    socket.on('alert', (newAlert) => {
      setUpdates(prev => [...prev, newAlert]);
    });

    return () => socket.disconnect();
  }, []);

  return (
    <div className="p-6 flex-1">
      <h1 className="text-3xl font-semibold mb-4">📢 College Updates</h1>
      
      <h2 className="text-2xl font-semibold mt-6 mb-4">Announcements</h2>
      {announcements.length === 0 ? (
        <p>No announcements available yet.</p>
      ) : (
        <div className="space-y-4">
          {announcements.map((announcement) => (
            <div key={announcement.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-blue-500">
              <h2 className="text-xl font-bold">{announcement.title}</h2>
              <p className="text-gray-600">{announcement.message}</p>
              <p className="text-sm text-gray-400 mt-2">
                🕒 {new Date(announcement.timestamp).toLocaleString()} | {announcement.type}
              </p>
            </div>
          ))}
        </div>
      )}

      <h2 className="text-2xl font-semibold mt-6 mb-4">Alerts</h2>
      {updates.length === 0 ? (
        <p>No alerts available yet.</p>
      ) : (
        <div className="space-y-4">
          {updates.map((update) => (
            <div key={update.id} className="bg-white p-4 rounded-lg shadow-md border-l-4 border-red-500">
              <h2 className="text-xl font-bold">{update.title}</h2>
              <p className="text-gray-600">{update.message}</p>
              <p className="text-sm text-gray-400 mt-2">
                🕒 {new Date(update.timestamp).toLocaleString()} | {update.type}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Updates;
