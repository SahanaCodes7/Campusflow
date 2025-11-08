const form = document.getElementById("assignmentForm");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("title").value.trim();
  const deadline = document.getElementById("deadline").value;
  const description = document.getElementById("description").value.trim();
  const fileInput = document.getElementById("pdf");
  const statusEl = document.getElementById('uploadStatus');
  statusEl.innerText = ''; // Clear previous status

  if (!title || !deadline) {
    statusEl.innerText = "Please fill title and deadline!";
    return;
  }

  let attachmentUrl = null;
  if (fileInput.files && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    
    // Check file type
    if (!file.type.match(/^(application\/pdf|image\/(jpeg|png|gif))$/)) {
      statusEl.innerText = 'Error: Only PDF files and images are allowed!';
      return;
    }

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      statusEl.innerText = 'Error: File size should not exceed 10MB!';
      return;
    }

    statusEl.innerText = 'Uploading file...';
    
    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const up = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!up.ok) {
        const contentType = up.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await up.json();
          throw new Error(errorData.error || 'Upload failed');
        } else {
          throw new Error(`Server error: ${up.status}`);
        }
      }

      const upData = await up.json();
      if (upData.url) {
        attachmentUrl = upData.url;
        statusEl.innerText = 'File uploaded successfully ✅';
      } else {
        throw new Error('Upload response missing URL');
      }
    } catch (err) {
      console.error('Upload error:', err);
      statusEl.innerText = 'Upload failed: ' + (err.message || 'Unknown error');
      return;
    }
  }

  const res = await fetch("/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, deadline, description, attachmentUrl }),
  });

  const data = await res.json();
  if (res.ok) {
    statusEl.innerText = data.message || 'Assignment added.';
    form.reset();
    loadAssignments();
    // clear message after a while
    setTimeout(() => { statusEl.innerText = ''; }, 3000);
  } else {
    statusEl.innerText = 'Failed to add assignment: ' + (data.error || data.message || 'Unknown');
    console.error('Add assignment failed', data);
  }
});

async function loadAssignments() {
  const res = await fetch("/assignments");
  const assignments = await res.json();

  list.innerHTML = "";
  assignments.forEach((a) => {
    const div = document.createElement("div");
    div.className = "assignment-card";
    div.innerHTML = `
      <h3>${a.title}</h3>
      <p>📅 ${new Date(a.deadline).toLocaleString()}</p>
      <p>Status: ${a.status}</p>
      ${a.description ? `<p>${a.description}</p>` : ''}
      ${a.attachmentUrl ? `<a class="pdf-link" href="${a.attachmentUrl}" target="_blank">📎 View Attachment</a>` : ''}
    `;
    list.appendChild(div);
  });
}

loadAssignments();
setInterval(loadAssignments, 10000);
