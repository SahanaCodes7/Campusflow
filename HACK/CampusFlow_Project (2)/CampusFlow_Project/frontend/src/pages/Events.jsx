import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";

export default function Events() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://127.0.0.1:5050/api/events")
      .then((res) => res.json())
      .then((data) => {
        setEvents(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching events:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-indigo-700 flex items-center gap-2 mb-4">
        <CalendarDays size={28} /> Upcoming College Events
      </h1>

      {loading ? (
        <p className="text-gray-500">Loading events...</p>
      ) : events.length === 0 ? (
        <p className="text-gray-500">No events found. Add some in EventsHub!</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-white shadow-md rounded-xl p-4 border border-indigo-100 hover:shadow-lg transition-all"
            >
              <h2 className="text-lg font-semibold text-indigo-700">
                {event.name}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {event.description || "No description provided."}
              </p>
              <p className="text-sm text-gray-500 mt-2">
                📅 {event.datetime || "Date not specified"}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
