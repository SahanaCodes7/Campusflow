import { useEffect, useState } from "react";

export default function UpdatesPage() {
  const [updates, setUpdates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchUpdates() {
      try {
        const res = await fetch("http://127.0.0.1:7000/updates");
        const data = await res.json();
        setUpdates(data.updates || []);
      } catch (err) {
        console.error("Error fetching updates:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchUpdates();
  }, []);

  if (loading) return <p className="text-gray-500">Loading updates...</p>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-blue-700 mb-4">Latest Updates</h1>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {updates.length === 0 ? (
          <p className="text-gray-600">No updates available.</p>
        ) : (
          updates.map((u) => (
            <div
              key={u.id}
              className="bg-white p-4 rounded-2xl shadow hover:shadow-lg transition duration-200"
            >
              <h2 className="text-xl font-semibold text-blue-600">
                {u.title}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(u.datetime).toLocaleString()}
              </p>
              <span className="inline-block bg-blue-100 text-blue-700 text-sm font-medium px-2 py-1 mt-2 rounded-lg">
                {u.type}
              </span>
              <p className="mt-3 text-gray-700">{u.description}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
