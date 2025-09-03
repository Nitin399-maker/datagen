import { render, html } from "https://cdn.jsdelivr.net/npm/lit-html@3/+esm";
import { unsafeHTML } from "https://cdn.jsdelivr.net/npm/lit-html@3/directives/unsafe-html.js";
import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { bootstrapAlert } from "https://cdn.jsdelivr.net/npm/bootstrap-alert@1";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11/+esm";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { PROMPTS } from "./utils.js";

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
function showLoading(show, text = "Processing...") {
  const loadingEl = $("loading");
  const loadingTextEl = $("loading-text");
  loadingEl.classList.toggle("d-none", !show);
  if (show) render(html`${text}`, loadingTextEl);
}

function hideElements(...ids) {
  ids.forEach((id) => $(id).classList.add("d-none"));
}

function showElements(...ids) {
  ids.forEach((id) => $(id).classList.remove("d-none"));
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
    if (!provider) {
      throw new Error("LLM not configured");
    }
  }

  const req = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: currentModel,
      messages: [
        { role: "system", content: PROMPTS.initial },
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
  try {
    showLoading(true, "Loading Python...", 20);
    pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
    showLoading(true, "Installing core packages...", 40);
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    for (const [name, progress] of [
      ["pandas", 65],
      ["numpy", 70],
      ["faker", 75],
      ["openpyxl", 85],
    ]) {
      showLoading(true, `Installing ${name}...`, progress);
      try {
        await micropip.install(name);
      } catch {
        await pyodide.loadPackage(name);
      }
    }
    pyodideLoaded = true;
    return pyodide;
  } finally {
    showLoading(false);
  }
}

async function executePython() {
  if (!generatedCode) {
    bootstrapAlert({ body: "No Python code to execute", color: "warning" });
    return;
  }

  $("btn-run-code").disabled = true;
  showLoading(true, "Executing code...", 0);

  try {
    const pyodideInstance = await initPython();
    showLoading(true, "Running Python code...", 50);
    await pyodideInstance.runPython(generatedCode);
    showLoading(true, "Processing data...", 80);

    const vars = (key) => pyodideInstance.runPython(`'${key}' in globals()`);
    const hasData = vars("result_data");
    if (!hasData) throw new Error("No result_data variable found");

    const rawData = pyodideInstance.runPython("result_data");
    const filename = vars("result_filename") ? pyodideInstance.runPython("result_filename") : "synthetic_data.xlsx";
    const rows = vars("result_rows") ? pyodideInstance.runPython("result_rows") : 0;
    const bytes = Uint8Array.from(atob(rawData), (c) => c.charCodeAt(0));
    const dataSize = bytes.length;

    if (!bytes || bytes.length === 0) throw new Error("Processed data is empty");

    dataResult = { filename, data: bytes, rows, size: dataSize };
    showElements("download-buttons");
    $("user-prompt").value = "";

    bootstrapAlert({ body: `Excel dataset ready: ${rows} rows, ${dataSize} bytes`, color: "success" });
  } catch (err) {
    bootstrapAlert({ body: `Execution error: ${err.message}`, color: "danger" });
  } finally {
    showLoading(false);
    $("btn-run-code").disabled = false;
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
    const { filename = "synthetic_data.xlsx", data } = res;
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
    bootstrapAlert({
      body: "Please enter a dataset scenario",
      color: "warning",
    });
    return;
  }

  hideElements("btn-run-code", "download-buttons");
  generatedCode = "";
  dataResult = null;
  currentModel = $("model-select").value;

  try {
    await generateDataset(promptText);
    bootstrapAlert({ body: "Code generated successfully", color: "success" });
  } catch (err) {
    bootstrapAlert({ body: `Error: ${err.message}`, color: "danger" });
  } finally {
    showLoading(false);
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
