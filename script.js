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
    pyodideLoaded: false
};

const UI = {
    showLoading: (show, text = 'Processing...', progress = 0) => {
        $('loading').classList.toggle('d-none', !show);
        if (show) { $('loading-text').textContent = text; }
    },
    updateStatus: (status, type = 'secondary') => {
        const indicator = $('status-indicator');
        indicator.textContent = status;
        indicator.className = `badge bg-${type} ms-2`;
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
            const filteredModels = cfg.models.filter(model => {
            const modelName = model.toLowerCase();
            return modelName.includes('gpt-4.1') || modelName.includes('gpt-5');
            });
            S.models = filteredModels.map(model => ({ id: model, name: model }));
            S.currentModel = S.models.find(m => m.id.toLowerCase().includes('gpt-4.1'))?.id || 
                            S.models.find(m => m.id.toLowerCase().includes('gpt-5'))?.id ||
                            S.models[0]?.id;
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
    async generate(promptText) {
        if (!S.provider) throw new Error('LLM not configured');
        const req = {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${S.provider.apiKey}` },
            body: JSON.stringify({
                model: S.currentModel,
                messages:[{role:"system",content:PROMPTS.initial},{role:"user",content:promptText}],
                stream: true
            })
        };
        let content = "";
        const respDiv = $('response-content');
        UI.showElements('response-container');
        respDiv.innerHTML = `<div class="text-muted">Generating dataset...</div>`;
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
                try { await micropip.install(name); } catch(e) { await S.pyodide.loadPackage(name); }
            }
            return S.pyodideLoaded = true, S.pyodide;
        } finally {  UI.showLoading(false); }
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
                filename = vars('result_filename') ? pyodide.runPython("result_filename") : "synthetic_data.xlsx",
                rows = vars('result_rows') ? pyodide.runPython("result_rows") : 0;
            const bytes = Uint8Array.from(atob(rawData), c => c.charCodeAt(0));
            const dataSize = bytes.length;
            if (!bytes || (bytes.length === 0))
                throw new Error('Processed data is empty');
            S.dataResult = { filename, data: bytes, rows, size: dataSize };
            UI.showElements('download-buttons');
            $('user-prompt').value = "";
            UI.alert('success', `Excel dataset ready: ${rows} rows, ${dataSize} bytes`);
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
            const { filename = 'synthetic_data.xlsx', data } = res;
            if (!data?.length) throw new Error('Data is empty');
            const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
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
    if (!promptText) return UI.alert('warning', 'Please enter a dataset scenario');
    UI.hideElements('btn-run-code', 'download-buttons');
    Object.assign(S, { generatedCode: "", dataResult: null, currentModel: $('model-select').value });
    try {
        await LLM.generate(promptText);
        UI.alert('success', 'code generated successfully');
    } catch (err) {
        UI.alert('danger', `Error: ${err.message}`);
    } finally {  UI.showLoading(false);  }
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
        $('model-select').addEventListener('change', e => { S.currentModel = e.target.value;  });
    }
};

window.downloadDataFile = Data.download;
Events.init();
LLM.init().catch(() => {
    UI.updateStatus('Not Configured', 'secondary');
});