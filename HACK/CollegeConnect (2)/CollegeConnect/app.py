import requests
from flask import Flask, render_template, request, jsonify, redirect, url_for
from flask_cors import CORS
import json, os, requests, datetime

app = Flask(__name__)
CORS(app, 
     resources={r"/*": {
         "origins": "*",
         "methods": ["GET", "POST", "OPTIONS"],
         "allow_headers": ["Content-Type", "Authorization"]
     }},
     supports_credentials=True)

# === CONFIG ===
DATA_FILE = "data.json"
CAMPUSFLOW_SYNC_URL = "http://127.0.0.1:3000/api/sync"  # CampusFlow endpoint

# Enable CORS headers on all responses
@app.before_request
def before_request():
    if request.method == "OPTIONS":
        response = app.make_default_options_response()
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
        return response
    
    # Force JSON parsing for POST requests with JSON content
    if request.method == "POST" and request.is_json:
        try:
            _ = request.get_json()
        except Exception as e:
            return jsonify({"error": f"Invalid JSON in request: {str(e)}"}), 400

@app.after_request
def after_request(response):
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE')
    return response

# === UTIL FUNCTIONS ===
def load_data():
    """Load all updates from JSON file."""
    if not os.path.exists(DATA_FILE):
        return {"updates": []}
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            # Normalize legacy fields and ensure schema consistency
            changed = False
            updates = data.get("updates", []) if isinstance(data.get("updates", []), list) else []
            max_id = max([u.get("id", 0) for u in updates], default=0)
            for u in updates:
                # move legacy 'description' -> 'content'
                if "description" in u and "content" not in u:
                    u["content"] = u.pop("description")
                    changed = True
                # ensure required fields
                if "type" not in u or not u.get("type"):
                    u["type"] = u.get("type", "general")
                    changed = True
                if "datetime" not in u:
                    u["datetime"] = datetime.datetime.now().isoformat()
                    changed = True
                # ensure id exists and is int
                if "id" not in u:
                    max_id += 1
                    u["id"] = max_id
                    changed = True
            data["updates"] = updates
            # Persist normalization back to file if we changed anything (keep a backup)
            if changed:
                try:
                    # create a small backup
                    bak = DATA_FILE + ".bak"
                    with open(bak, "w", encoding="utf-8") as bf:
                        json.dump(data, bf, indent=2, ensure_ascii=False)
                    save_data(data)
                    print("🔧 Normalized data.json and saved backup to", bak)
                except Exception:
                    print("⚠️ Failed to write normalized backup")
            return data
    except json.JSONDecodeError:
        print("⚠️ data.json was corrupted, resetting.")
        return {"updates": []}


def save_data(data):
    """Save updates to JSON file."""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# === ROUTES ===
@app.route("/")
def index():
    """Render homepage showing all updates."""
    data = load_data()
    updates = sorted(data.get("updates", []), key=lambda x: x.get("datetime", ""), reverse=True)
    return render_template("index.html", updates=updates)


@app.route("/updates", methods=["GET", "OPTIONS"])
def get_updates():
    """API endpoint: return all updates."""
    if request.method == "OPTIONS":
        return "", 200
        
    data = load_data()
    response = jsonify(data.get("updates", []))
    response.headers['Content-Type'] = 'application/json'
    return response




@app.route("/add-update", methods=["POST", "OPTIONS"])
def add_update():
    """Add a new update via HTML form or API."""
    if request.method == "OPTIONS":
        return "", 200
        
    try:
        print("Headers:", dict(request.headers))
        print("Raw Data:", request.get_data(as_text=True))
        
        # Always try JSON first if Content-Type is set to application/json
        if request.is_json or 'application/json' in request.headers.get('Content-Type', '').lower():
            try:
                payload = request.get_json(force=True)
                print("JSON Payload:", payload)
            except Exception as e:
                print("JSON parsing error:", str(e))
                return jsonify({"error": "Invalid JSON in request body"}), 400
        # Then try form data
        elif request.form:
            payload = request.form.to_dict()
            print("Form Payload:", payload)
        # Finally, try forcing JSON parsing as a fallback
        else:
            try:
                raw_data = request.get_data(as_text=True)
                if not raw_data:
                    return jsonify({"error": "Empty request body"}), 400
                payload = json.loads(raw_data)
                print("Forced JSON Payload:", payload)
            except json.JSONDecodeError as e:
                print("JSON decode error:", str(e))
                return jsonify({
                    "error": "Invalid request format",
                    "message": "Request must be valid JSON with Content-Type: application/json header or form data"
                }), 415
        
        # Handle batch updates from CampusFlow
        if isinstance(payload.get('updates'), list):
            updates_added = 0
            data = load_data()
            
            for update in payload['updates']:
                new_update = {
                    'id': len(data['updates']) + 1,
                    'title': update.get('title', 'Untitled'),
                    'type': update.get('type', 'General'),
                    'datetime': update.get('datetime', datetime.datetime.now().isoformat()),
                    'content': update.get('content', '')
                }
                data['updates'].append(new_update)
                updates_added += 1
            
            save_data(data)
            return jsonify({"status": "success", "updates_added": updates_added})
        
        # Handle single update
        title = payload.get("title")
        if not title:
            return jsonify({"error": "Title is required"}), 400
            
        content = payload.get("content", "")
        update_type = payload.get("type", "General")
        datetime_str = payload.get("datetime") or datetime.datetime.now().isoformat()
        
        # Load existing data and dedupe
        data = load_data()
        data.setdefault("updates", [])

        # Build new update dict (without id yet)
        new_update = {
            "title": title.strip(),
            "content": content.strip(),
            "type": update_type.strip(),
            "datetime": datetime_str
        }

        # Deduplicate: look for same title+content (normalized)
        def norm_title(t):
            if not t:
                return ""
            return t.lower().strip().removeprefix("alert:").strip()

        def is_same(a, b):
            return (norm_title(a.get("title", "")) == norm_title(b.get("title", ""))
                    and (a.get("content", "").strip() == b.get("content", "").strip()))

        for existing in data["updates"]:
            if is_same(existing, new_update):
                # already exists, return existing
                if request.form:
                    return redirect(url_for("index"))
                return jsonify({"status": "exists", "update": existing})

        # Generate new ID
        max_id = max([u.get("id", 0) for u in data["updates"]], default=0)
        new_update["id"] = max_id + 1
        data["updates"].append(new_update)
        save_data(data)
        
        # Try syncing with CampusFlow (non-fatal)
        try:
            res = requests.post(
                CAMPUSFLOW_SYNC_URL,
                json={"source": "CollegeConnect", "update": new_update},
                timeout=5
            )
            if res.status_code == 200:
                print(f"✅ Synced update '{new_update['title']}' with CampusFlow")
            else:
                print(f"⚠️ CampusFlow sync failed: {res.status_code}")
        except Exception as e:
            print(f"⚠️ Failed to sync with CampusFlow: {str(e)}")
        
        # Return success response
        if request.form:
            return redirect(url_for("index"))
        return jsonify({"status": "success", "update": new_update})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/sync", methods=["POST"])
def sync_with_campusflow():
    """Sync data with CampusFlow."""
    try:
        # Get data from CampusFlow
        data = request.get_json()
        if not data:
            return jsonify({"status": "error", "message": "No data received"}), 400
        
        # Load existing data
        local_data = load_data()
        local_data.setdefault("updates", [])

        # Track changes
        changes_made = False

        # Get max ID for new updates
        max_id = max([u.get('id', 0) for u in local_data["updates"]], default=0)

        def norm_title(t):
            if not t:
                return ""
            return t.lower().strip().removeprefix("alert:").strip()

        def exists_similar(title, content):
            for u in local_data["updates"]:
                if (norm_title(u.get('title')) == norm_title(title)
                        and (u.get('content', '').strip() == (content or '').strip())):
                    return True
            return False

        # Merge assignments as updates
        for assignment in data.get("assignments", []):
            title_text = f"New Assignment: {assignment.get('title', '')}"
            content_text = assignment.get('description', '') or assignment.get('content', '') or ''
            if exists_similar(title_text, content_text):
                continue
            max_id += 1
            new_update = {
                "id": max_id,
                "title": title_text,
                "content": content_text,
                "datetime": assignment.get('dueDate', datetime.datetime.now().isoformat()),
                "type": "assignment"
            }
            local_data["updates"].append(new_update)
            changes_made = True

        # Merge alerts as updates
        for alert in data.get("alerts", []):
            title_text = alert.get('title') or alert.get('message') or 'Alert'
            content_text = alert.get('message', '')
            if exists_similar(title_text, content_text):
                continue
            max_id += 1
            new_update = {
                "id": max_id,
                "title": title_text,
                "content": content_text,
                "datetime": alert.get('timestamp', datetime.datetime.now().isoformat()),
                "type": "alert"
            }
            local_data["updates"].append(new_update)
            changes_made = True
        
        # Save merged data if changes were made
        if changes_made:
            save_data(local_data)
            return jsonify({"status": "success", "message": "Data synced successfully"})
        return jsonify({"status": "success", "message": "No new updates to sync"})
        
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/delete-update/<int:update_id>", methods=["POST"])
def delete_update(update_id):
    """Delete a specific update by ID."""
    data = load_data()
    data["updates"] = [u for u in data.get("updates", []) if u.get("id") != update_id]
    save_data(data)
    return redirect(url_for("index"))


# === CAMPUSFLOW RECEIVE HOOK ===
@app.route("/api/receive-sync", methods=["POST"])
def receive_sync():
    """CampusFlow can POST updates here for two-way sync."""
    payload = request.json or {}
    incoming = payload.get("new_update")
    if not incoming:
        return jsonify({"error": "No update provided"}), 400

    data = load_data()
    ids = [u["id"] for u in data.get("updates", [])]
    if incoming.get("id") in ids:
        return jsonify({"message": "Already exists"}), 200

    data["updates"].append(incoming)
    save_data(data)
    print(f"🔁 Received sync from CampusFlow: {incoming['title']}")
    return jsonify({"message": "Synced successfully"}), 200


# === RUN SERVER ===
if __name__ == "__main__":
    # Ensure data file exists
    if not os.path.exists(DATA_FILE):
        save_data({"updates": []})
        print("📁 Created new data.json file")
        
    print("🚀 CollegeConnect running on http://127.0.0.1:7000")
    print("🌐 Syncing with CampusFlow at http://127.0.0.1:3000")
    app.run(host="127.0.0.1", port=7000, debug=True)
