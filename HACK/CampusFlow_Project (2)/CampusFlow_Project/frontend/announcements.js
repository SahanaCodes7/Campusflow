// announcements.js - Dedicated announcements handling
async function loadAnnouncements() {
    try {
        const response = await fetch('http://localhost:3000/api/announcements');
        const announcements = await response.json();
        
        const container = document.getElementById('announcements-container');
        if (!container) return;

        container.innerHTML = '';
        
        if (!announcements || announcements.length === 0) {
            container.innerHTML = '<div class="bg-white p-4 rounded-lg shadow-md text-gray-500">No announcements yet.</div>';
            return;
        }

        // Sort announcements by timestamp (newest first)
        announcements.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        announcements.forEach(announcement => {
            const card = document.createElement('div');
            card.className = 'bg-white p-4 rounded-lg shadow-md border-l-4 border-indigo-500 mb-4';
            
            // Choose icon based on announcement type
            let icon = '📢'; // default
            if (announcement.type === 'assignment') {
                icon = '📝'; // assignment deadline
            } else if (announcement.type === 'exam') {
                icon = '📚'; // exam
            }
            
            card.innerHTML = `
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <h3 class="text-lg font-semibold text-gray-800">${icon} ${escapeHtml(announcement.title)}</h3>
                        <p class="text-gray-600 mt-1">${escapeHtml(announcement.message)}</p>
                        <p class="text-sm text-gray-500 mt-2">${new Date(announcement.timestamp).toLocaleString()}</p>
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    } catch (error) {
        console.error('Failed to load announcements:', error);
        const container = document.getElementById('announcements-container');
        if (container) {
            container.innerHTML = '<div class="bg-white p-4 rounded-lg shadow-md text-red-500">Failed to load announcements.</div>';
        }
    }
}

// Utility function to escape HTML and prevent XSS
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}