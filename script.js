// ====== CONFIG - filled for your environment ======
// frontend
const FRONTEND_BUCKET = "photo-frontend-112925";
const FRONTEND_URL = "http://photo-frontend-112925.s3-website-us-east-1.amazonaws.com/";

// photo storage
const S3_UPLOAD_BUCKET = "skumuda-photo-album-bucket";
const BUCKET_URL = `https://${S3_UPLOAD_BUCKET}.s3.amazonaws.com/`;

// API
const API_BASE = "https://2bm42jw5i8.execute-api.us-east-1.amazonaws.com/prod";
const API_KEY = "";  // not required for your API (API Key Required = False)


// If SDK is present, there should be apigClientFactory
let apigClient = null;
try {
  if (typeof apigClientFactory !== "undefined") {
    apigClient = apigClientFactory.newClient({ apiKey: API_KEY || undefined });
    console.log("apigClient methods:", Object.keys(apigClient || {}));
  } else {
    console.log("apigClientFactory not found — SDK not loaded, will use fetch() fallback.");
  }
} catch (err) {
  console.warn("Error creating apigClient (SDK may be present but initialization failed):", err);
  apigClient = null;
}

// ====== UI hooks ======
const fileInput = () => document.getElementById("photoFile");
const labelsInput = () => document.getElementById("customLabels");
const resultsDiv = () => document.getElementById("results");
const searchInput = () => document.getElementById("searchQuery");

// ====== HELPERS ======
function addImagePreview(url) {
  const container = resultsDiv();
  if (!container) return;
  const img = document.createElement("img");
  img.src = url;
  img.style.maxWidth = "250px";
  img.style.margin = "8px";
  container.prepend(img);
}

function displayResults(items) {
  const container = resultsDiv();
  if (!container) return;
  container.innerHTML = "";
  if (!items || items.length === 0) {
    container.innerText = "No results";
    return;
  }

  items.forEach(item => {
    // Support several possible field names returned by your search lambda
    const bucket = item.bucket || S3_UPLOAD_BUCKET || item.Bucket;
    const key = item.objectKey || item.key || item.filename || item.ObjectKey;
    if (!key) return; // skip invalid entry

    const img = document.createElement("img");
    img.src = `https://${bucket}.s3.amazonaws.com/${encodeURIComponent(key)}`;
    img.style.maxWidth = "250px";
    img.style.margin = "8px";
    container.appendChild(img);
  });
}

// ====== SEARCH ======
async function searchPhotos() {
  const q = (searchInput() && searchInput().value || "").trim();
  if (!q) return alert("Enter a search query.");

  // Try SDK if available
  if (apigClient && typeof apigClient.searchGet === "function") {
    try {
      const params = { q };
      const body = {};
      const additionalParams = {};
      const resp = await apigClient.searchGet(params, body, additionalParams);
      // SDK responses often have data property
      const results = resp && (resp.data || resp) || [];
      // If search lambda returns object with 'results', handle that
      const arr = Array.isArray(results) ? results : (results.results || []);
      displayResults(arr);
      return;
    } catch (err) {
      console.warn("SDK search failed, falling back to fetch():", err);
    }
  }

  // Fallback to fetch
  try {
    const url = `${API_BASE}/search?q=${encodeURIComponent(q)}`;
    const headers = {};
    if (API_KEY) headers["x-api-key"] = API_KEY;
    const r = await fetch(url, { method: "GET", headers });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`${r.status} ${txt}`);
    }
    const json = await r.json();
    // If your lambda returns { results: [...] } handle that
    const arr = Array.isArray(json) ? json : (json.results || []);
    displayResults(arr);
  } catch (err) {
    console.error("Search failed:", err);
    alert("Search failed: " + (err.message || err));
  }
}

// ====== UPLOAD ======
async function uploadPhoto() {
  if (!fileInput() || !fileInput().files.length) {
    alert("Please choose a file to upload.");
    return;
  }
  const file = fileInput().files[0];
  const customLabels = (labelsInput() && labelsInput().value) || "";
  const objectKey = Date.now() + "_" + file.name;

  // 1) Try SDK upload (auto-detect method names that look like photos PUT)
  if (apigClient) {
    try {
      const candidateName = Object.keys(apigClient).find(n => /photos.*put/i.test(n));
      if (candidateName && typeof apigClient[candidateName] === "function") {
        const params = {
          // include common path param names used in SDKs; one should match
          object: objectKey,
          key: objectKey,
          filename: objectKey,
          bucket: S3_UPLOAD_BUCKET
        };
        const additionalParams = {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "x-amz-meta-customLabels": customLabels
          }
        };
        if (API_KEY) additionalParams.headers["x-api-key"] = API_KEY;

        const resp = await apigClient[candidateName](params, file, additionalParams);
        console.log("SDK upload response:", resp);
        alert("Upload (SDK) successful: " + objectKey);
        addImagePreview(BUCKET_URL + encodeURIComponent(objectKey));
        return;
      }
    } catch (err) {
      console.warn("SDK upload attempt failed, will try fetch() fallback:", err);
    }
  }

  // 2) Fallback: direct PUT to API Gateway S3 proxy via fetch()
  try {
    const url = `${API_BASE}/photos/${encodeURIComponent(objectKey)}`;
    const headers = {
      "x-amz-meta-customLabels": customLabels
    };
    if (API_KEY) headers["x-api-key"] = API_KEY;

    const resp = await fetch(url, {
      method: "PUT",
      headers,
      body: file
    });

    if (!resp.ok) {
      const txt = await resp.text().catch(() => "");
      throw new Error(`${resp.status} ${txt}`);
    }

    alert("Upload successful: " + objectKey);
    addImagePreview(BUCKET_URL + encodeURIComponent(objectKey));
    return;
  } catch (err) {
    console.error("Upload failed:", err);
    alert("Upload failed: " + (err.message || err));
  }
}

// wire buttons (works whether you used inline onclick or not)
document.addEventListener("DOMContentLoaded", () => {
  // inspect SDK client methods in console for debugging
  if (apigClient) console.log("apigClient available. methods:", Object.keys(apigClient));

  const searchBtn = document.getElementById("searchBtn");
  const uploadBtn = document.getElementById("uploadBtn");
  if (searchBtn) searchBtn.addEventListener("click", searchPhotos);
  if (uploadBtn) uploadBtn.addEventListener("click", uploadPhoto);
});
