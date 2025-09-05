import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { bootstrapAlert } from "https://cdn.jsdelivr.net/npm/bootstrap-alert@1";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11/+esm";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
let demos = [];

const $ = (id) => document.getElementById(id);
const marked = new Marked();
marked.use({
  renderer: {
    code: (code, lang) => {
      const language = hljs.getLanguage(lang) ? lang : "python";
      const highlighted = hljs.highlight(code, { language }).value;
      return `<pre class="hljs language-${language} p-3 rounded"><code>${highlighted}</code></pre>`;
    },
  },
});

// Global state variables
let provider = null;
let currentModel = "gpt-4.1-mini";
let generatedCode = "";
let pyodide = null;
let dataResult = null;
let pyodideLoaded = false;

// UI helper functions
function showLoading(text = "Processing...") {
  $("btn-run-code").innerText = text;
}

function hideElements(...ids) {
  ids.forEach((id) => $(id)?.classList.add("d-none"));
}

function showElements(...ids) {
  ids.forEach((id) => $(id)?.classList.remove("d-none"));
}

// Config loading and demos
async function loadConfig() {
  const container = $("demo-cards");
  render(
    html`<div class="d-flex justify-content-center my-3">
      <div class="spinner-border text-primary" role="status" aria-label="Loading demos"></div>
    </div>`,
    container,
  );
  try {
    const resp = await fetch("./config.json", { cache: "no-store" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();
    demos = Array.isArray(json?.demos) ? json.demos : [];
    renderDemoCards();
  } catch (e) {
    bootstrapAlert({ body: `Failed to load config.json: ${e.message}`, color: "danger" });
    render(
      html`<div class="alert alert-danger" role="alert">Unable to load demos. Please check config.json.</div>`,
      container,
    );
  }
}

// Demo cards rendering and handling
function renderDemoCards() {
  const demoCardsContainer = $("demo-cards");

  const cardsTemplate = html`
    ${demos.map(
      (demo, index) => html`
        <div class="col-md-6 col-lg-4">
          <div class="card h-100 demo-card" style="cursor: pointer;" data-demo-index="${index}">
            <div class="card-body">
              <h6 class="card-title">${demo.title}</h6>
              <p class="card-text small text-muted">${demo.description}</p>
            </div>
          </div>
        </div>
      `,
    )}
  `;

  render(cardsTemplate, demoCardsContainer);

  // Add click handlers to demo cards
  demoCardsContainer.addEventListener("click", handleDemoCardClick);
}

function handleDemoCardClick(event) {
  const card = event.target.closest(".demo-card");
  if (!card) return;

  const demoIndex = parseInt(card.dataset.demoIndex);
  const selectedDemo = demos[demoIndex];

  if (selectedDemo) {
    // Update the textarea with the demo prompt
    $("user-prompt").value = selectedDemo.prompt;

    // Visual feedback
    document.querySelectorAll(".demo-card").forEach((c) => c.classList.remove("border-primary"));
    card.classList.add("border-primary");

    // Scroll generate dataset button into view
    $("btn-generate").scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

// LLM functions
async function initLLM(show = false) {
  try {
    const cfg = await openaiConfig({
      title: "LLM Configuration for Data Generator",
      defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"],
      show,
    });
    provider = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
  } catch (e) {
    bootstrapAlert({ body: `Failed to configure LLM: ${e.message}`, color: "danger" });
  }
}

async function generateDataset(promptText) {
  if (!provider) {
    // Initialize LLM on demand
    await initLLM();
    if (!provider) throw new Error("LLM not configured");
  }

  const systemPrompt = $("system-prompt").value.trim();
  const req = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: currentModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: promptText },
      ],
      stream: true,
    }),
  };

  let content = "";
  const respDiv = $("response-content");
  showElements("response-container");

  render(html`<div class="text-muted">Generating dataset...</div>`, respDiv);

  for await (const data of asyncLLM(`${provider.baseUrl}/chat/completions`, req)) {
    if (data.content) {
      content = data.content;
      render(html`${unsafeHTML(marked.parse(content))}`, respDiv);
      const match = content.match(/```python\n([\s\S]*?)\n```/);
      if (match) {
        generatedCode = match[1];
        showElements("btn-run-code");
      }
    }
  }
}

// Python execution functions
async function initPython() {
  if (pyodideLoaded) return pyodide;
  $("btn-run-code").disabled = true;
  $("btn-run-code").innerHTML = "";
  showLoading("Loading Python...");
  pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
  showLoading("Installing core packages...");
  await pyodide.loadPackage("micropip");
  const micropip = pyodide.pyimport("micropip");
  for (const name of ["pandas", "numpy", "faker", "openpyxl"]) {
    showLoading(`Installing ${name}...`);
    try {
      await micropip.install(name);
    } catch {
      await pyodide.loadPackage(name);
    }
  }
  pyodideLoaded = true;
  return pyodide;
}

async function executePython() {
  if (!generatedCode) {
    bootstrapAlert({ body: "No Python code to execute", color: "warning" });
    return;
  }

  $("btn-run-code").disabled = true;
  showLoading("Executing code...");

  try {
    const pyodideInstance = await initPython();
    showLoading("Running Python code...");
    await pyodideInstance.runPython(generatedCode);
    showLoading("Processing data...");

    const vars = (key) => pyodideInstance.runPython(`'${key}' in globals()`);
    const hasData = vars("result_data");
    if (!hasData) throw new Error("No result_data variable found");

    const rawData = pyodideInstance.runPython("result_data");
    const filename = vars("result_filename") ? pyodideInstance.runPython("result_filename") : "synthetic-data.xlsx";
    const rows = vars("result_rows") ? pyodideInstance.runPython("result_rows") : 0;
    const bytes = Uint8Array.from(atob(rawData), (c) => c.charCodeAt(0));
    const dataSize = bytes.length;

    if (!bytes || bytes.length === 0) throw new Error("Processed data is empty");

    dataResult = { filename, data: bytes, rows, size: dataSize };
    showElements("download-buttons");
    $("user-prompt").value = "";

    bootstrapAlert({ body: `Excel dataset ready: ${rows} rows, ${dataSize} bytes`, color: "success" });

    $("btn-run-code").enabled = true;
  } catch (err) {
    bootstrapAlert({ body: `Execution error: ${err.message}`, color: "danger" });
    console.error(err);
    $("btn-run-code").value = "Code error: generate again"
  }
}

// Data download function
function downloadData() {
  const res = dataResult;
  if (!res?.data) {
    bootstrapAlert({ body: "No data available for download", color: "warning" });
    return;
  }

  try {
    const { filename = "synthetic-data.xlsx", data } = res;
    if (!data?.length) throw new Error("Data is empty");

    const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([data], { type: mime });
    if (!blob.size) throw new Error("Generated blob is empty");

    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a).click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    bootstrapAlert({ body: `${filename} downloaded successfully (${blob.size} bytes)`, color: "success" });
  } catch (e) {
    bootstrapAlert({ body: `Download failed: ${e.message}`, color: "danger" });
  }
}

// Main submit function
async function submit() {
  const promptText = $("user-prompt").value.trim();
  if (!promptText) {
    bootstrapAlert({ body: "Please enter a dataset scenario", color: "warning" });
    return;
  }

  hideElements("btn-run-code", "download-buttons");
  generatedCode = "";
  dataResult = null;
  currentModel = $("model-select").value;

  const btn = $("btn-generate");
  btn.disabled = true;
  // Add a small spinner next to existing text
  const SPINNER_CLASS = "_btn-generate-spinner";
  if (!btn.querySelector(`.${SPINNER_CLASS}`)) {
    const spin = document.createElement("span");
    spin.className = `spinner-border spinner-border-sm ms-2 ${SPINNER_CLASS}`;
    spin.setAttribute("role", "status");
    spin.setAttribute("aria-hidden", "true");
    btn.appendChild(spin);
  }

  try {
    await generateDataset(promptText);
    bootstrapAlert({ body: "Code generated successfully", color: "success" });
  } catch (err) {
    bootstrapAlert({ body: `Error: ${err.message}`, color: "danger" });
  } finally {
    btn.disabled = false;
    const spin = btn.querySelector(`.${SPINNER_CLASS}`);
    if (spin) spin.remove();
  }
}

// Global function for compatibility
window.downloadDataFile = downloadData;

// Event initialization
$("config-btn").addEventListener("click", () => initLLM(true));
$("btn-generate").addEventListener("click", submit);
$("btn-run-code").addEventListener("click", () => executePython());
$("btn-download-single").addEventListener("click", downloadData);
$("user-prompt").addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    submit();
  }
});
$("model-select").addEventListener("change", (e) => {
  currentModel = e.target.value;
});

// Initialize demo cards on page load
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
});
