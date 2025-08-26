import { asyncLLM } from "https://cdn.jsdelivr.net/npm/asyncllm@2";
import { openaiConfig } from "https://cdn.jsdelivr.net/npm/bootstrap-llm-provider@1.2";
import { bootstrapAlert } from "https://cdn.jsdelivr.net/npm/bootstrap-alert@1";
import hljs from "https://cdn.jsdelivr.net/npm/highlight.js@11/+esm";
import { Marked } from "https://cdn.jsdelivr.net/npm/marked@13/+esm";
import { PROMPTS } from "./utils.js";

const $ = id => document.getElementById(id);
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

const S = {
    provider: null,
    models: [],
    currentModel: null,
    generatedCode: "",
    pyodide: null,
    dataResult: null,
    pyodideLoaded: false,
    originalScenario: "",
    currentResponse: "",
    generationCount: 1,
    isModifying: false
};

const UI = {
    showLoading: (show, text = 'Processing...', progress = 0) => {
        $('loading').classList.toggle('d-none', !show);
        if (show) {  $('loading-text').textContent = text;  }
    },
    updateStatus: (status, type = 'secondary') => {
        const indicator = $('status-indicator');
        indicator.textContent = status;
        indicator.className = `badge bg-${type} ms-2`;
    },
    updateModeUI: (isModifying) => {
        S.isModifying = isModifying;
        const btn = $('btn-generate'),
              label = $('prompt-label'),
              prompt = $('user-prompt');
        Object.assign(btn, {
            innerHTML: isModifying ? '🔄 Modify Dataset' : '📊 Generate Dataset',
            className: isModifying ? 'btn btn-warning' : 'btn btn-primary'
        });
        label.textContent = isModifying ? 'Modify Your Dataset:' : 'Dataset Scenario:';
        prompt.placeholder = isModifying
            ? "Example: 'Add a products table' or 'Change customer count to 200'"
            : "Example: 'E-commerce data with customers, products, orders in Excel'";
    },
    alert: (type, message) => {
          bootstrapAlert({
              body: message, color: type,
              position: 'top-0 end-0',
              delay: type === 'success' ? 3000 : 5000
          });

    },
    hideElements: (...ids) => ids.forEach(id => $(id).classList.add('d-none')),
    showElements: (...ids) => ids.forEach(id => $(id).classList.remove('d-none')),
};

const LLM = {
    async init(show = false) {
        try {
            const cfg = await openaiConfig({
                title: "LLM Configuration for Data Generator",
                defaultBaseUrls: ["https://api.openai.com/v1", "https://openrouter.ai/api/v1"],
                show
            });
            S.provider = { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey };
            S.models = cfg.models.map(m => ({ id: m, name: m }));
            S.currentModel = S.models[0]?.id;
            this.fillModelDropdown();
            UI.updateStatus('Configured', 'success');
            $('btn-generate').disabled = false;
            UI.alert('success', 'LLM configured successfully');
        } catch (e) {
            UI.alert('danger', `Failed to configure LLM: ${e.message}`);
            UI.updateStatus('Error', 'danger');
        }
    },
    fillModelDropdown() {
        const sel = $('model-select');
        sel.innerHTML = '';
        S.models.forEach(m => sel.appendChild(Object.assign(document.createElement('option'), {
            value: m.id, textContent: m.name, selected: m.id === S.currentModel
        })));
    },
    async generate(promptText, isMod = false) {
        if (!S.provider) throw new Error('LLM not configured');

        const sysPrompt = isMod ? PROMPTS.modification : PROMPTS.initial;
        const usrPrompt = isMod
            ? `ORIGINAL SCENARIO: ${S.originalScenario}
               ORIGINAL RESPONSE: ${S.currentResponse}
               REQUESTED MODIFICATION: ${promptText}`
            : promptText;
        const req = {
            method: "POST",
            headers: {"Content-Type":"application/json","Authorization": `Bearer ${S.provider.apiKey}` },
            body: JSON.stringify({
                model: S.currentModel,
                messages: [{role: "system", content: sysPrompt }, {role:"user", content: usrPrompt}],
                stream: true
            })
        };
        let content = "";
        const respDiv = $('response-content');
        UI.showElements('response-container');
        respDiv.innerHTML = `<div class="text-muted">${isMod ? 'Modifying' : 'Generating'} dataset...</div>`;
        try {
            for await (const data of asyncLLM(`${S.provider.baseUrl}/chat/completions`, req)) {
                if (data.content) {
                    content = data.content;
                    respDiv.innerHTML = marked.parse(content);
                    const match = content.match(/```python\n([\s\S]*?)\n```/);
                    if (match) {
                        S.generatedCode = match[1];
                        UI.showElements('btn-run-code');
                    }
                }
            }
            S.currentResponse = content;
        } catch (e) {
            throw e;
        }
    }
};

const Python = {
    async init() {
        if (S.pyodideLoaded) return S.pyodide;
        try {
            UI.showLoading(true, 'Loading Python...', 20);
            S.pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.24.1/full/" });
            UI.showLoading(true, 'Installing core packages...', 40);
            await S.pyodide.loadPackage("micropip");
            const micropip = S.pyodide.pyimport("micropip");
            for (const [name, progress] of [
                ['pandas', 65], ['numpy', 70], ['faker', 75], ['openpyxl', 85]
            ]) {
                UI.showLoading(true, `Installing ${name}...`, progress);
                await micropip.install(name);
            }
            return S.pyodideLoaded = true, S.pyodide;
        } finally {
            UI.showLoading(false);
        }
    },
    async execute() {
        if (!S.generatedCode) return UI.alert('warning', 'No Python code to execute');
        $('btn-run-code').disabled = true;
        UI.showLoading(true, 'Executing code...', 0);
        try {
            const pyodide = await this.init();
            UI.showLoading(true, 'Running Python code...', 50);
            await pyodide.runPython(S.generatedCode);
            UI.showLoading(true, 'Processing data...', 80);
            const vars = key => pyodide.runPython(`'${key}' in globals()`);
            const hasData = vars('result_data');
            if (!hasData) throw new Error('No result_data variable found');
            const rawData = pyodide.runPython("result_data"),
                  filename = vars('result_filename') ? pyodide.runPython("result_filename") : "synthetic_data.csv",
                  format   = vars('result_format') ? pyodide.runPython("result_format") : "csv",
                  rows     = vars('result_rows') ? pyodide.runPython("result_rows") : 0;
            let processedData = rawData, dataSize;
            if (format === 'excel') {
                const bytes = Uint8Array.from(atob(rawData), c => c.charCodeAt(0));
                processedData = bytes;
                dataSize = bytes.length;
            } else {
                dataSize = rawData.length;
            }
            if (!processedData || (processedData.length === 0))
                throw new Error('Processed data is empty');
            S.dataResult = { filename, data: processedData, rows, format, size: dataSize };
            UI.showElements('download-buttons');
            $('user-prompt').value = "";
            if (!S.isModifying) UI.updateModeUI(true);
            const unit = format === 'csv' ? 'characters' : 'bytes';
            UI.alert('success', `${format.toUpperCase()} dataset ready: ${rows} rows, ${dataSize} ${unit}`);
        } catch (err) {
             UI.alert('danger', `Execution error: ${err.message}`);
        } finally {
            UI.showLoading(false);
            $('btn-run-code').disabled = false;
        }
    },
};

const Data = {
    download() {
        const res = S.dataResult;
        if (!res?.data) return UI.alert('warning', 'No data available for download');
        try {
            const { filename = 'synthetic_data.csv', data, format = 'csv' } = res;
            if (!data?.length) throw new Error('Data is empty');
            const mime = format === 'excel'
                ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                : 'text/csv;charset=utf-8';
            const blob = new Blob([data], { type: mime });
            if (!blob.size) throw new Error('Generated blob is empty');
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: filename });
            document.body.appendChild(a).click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            UI.alert('success', `${filename} downloaded successfully (${blob.size} bytes)`);
        } catch (e) {
            UI.alert('danger', `Download failed: ${e.message}`);
        }
    }
};

async function submit() {
    const promptText = $('user-prompt').value.trim();
    if (S.isModifying) {
        S.generationCount++;
    } else {
        S.originalScenario = promptText;
        S.generationCount = 1;
    }
    UI.hideElements('btn-run-code', 'download-buttons');
    Object.assign(S, { generatedCode: "", dataResult: null, currentModel: $('model-select').value });
    const isMod = S.isModifying;
    UI.showLoading(true, isMod ? 'Applying modifications...' : 'Analyzing scenario...', 0);
    try {
        await LLM.generate(promptText, isMod);
        UI.alert('success',isMod ?'Dataset modified successfully': 'Dataset generated successfully');
    } catch (err) {
        UI.alert('danger', `Error: ${err.message}`);
    } finally {
        UI.showLoading(false);
    }
}

const Events = {
    init() {
        $('config-btn').addEventListener('click', () => LLM.init(true));
        $('btn-generate').addEventListener('click', submit);
        $('btn-run-code').addEventListener('click', () => Python.execute());
        $('btn-download-single').addEventListener('click', Data.download);
        $('user-prompt').addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                submit();
            }
        });
        $('model-select').addEventListener('change', e => {
            S.currentModel = e.target.value;
        });
    }
};

window.downloadDataFile = Data.download;
UI.updateModeUI(false);
Events.init();
LLM.init().catch(() => {
    UI.updateStatus('Not Configured', 'secondary');
});