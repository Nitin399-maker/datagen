# DataGen – Synthetic Data Generator

**DataGen** is a browser-based tool that generates **realistic synthetic datasets** using **LLMs** (Large Language Models) and executes Python code **directly in the browser via Pyodide**.  
It allows developers, testers, and demo creators to quickly produce Excel datasets with realistic patterns, anomalies, and rules.

---

## ✨ Features

- **Prompt-based dataset generation** using GPT-based models (`gpt-4.1-mini`, `gpt-5-mini`, etc.)
- **Excel output** with base64 encoding (downloadable as `.xlsx`)
- **Runs Python in the browser** (via [Pyodide](https://pyodide.org/))
- **Popular dataset templates** (configurable via `config.json`)
- **Advanced settings** to customize:
  - LLM provider & model
  - System prompt & generation rules
- **Live code preview** with syntax highlighting
- **Safe in-browser execution** – no backend required
- **Bootstrap 5 UI** with light/dark mode toggle

---

## ⚙️ How It Works

1. User enters a **dataset scenario prompt** (e.g., *E-commerce orders with customers, products, and transactions*).
2. The tool sends the prompt to the selected **LLM provider** (OpenAI or OpenRouter).
3. The model returns:
   - Dataset **Schema & Rules**
   - Executable **Python code** (pandas, numpy, faker, openpyxl)
4. Code is run **in-browser with Pyodide**.
5. A downloadable **Excel file (.xlsx)** is generated.

---

## 🔧 Setup & Usage

### 1. Clone the repository
```bash
git clone https://github.com/Nitin399-maker/datagen.git
cd datagen


