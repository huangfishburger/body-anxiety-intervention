# 🏃‍♀️ Body Image

This project integrates a **Chrome Extension**, a **FastAPI backend**, and the **CLIP model** to analyze images from Instagram. 
The analysis detects potentially body-image–related content, and the system can activate an **intervention mechanism** to provide positive engagement and help mitigate negative effects.

## 🚀 Getting Started

### Install uv
Follow the official installation guide:  
👉 [https://docs.astral.sh/uv/getting-started/installation/#installation-methods](https://docs.astral.sh/uv/getting-started/installation/)

### Install dependencies
```bash
# If you don't have Python 3.10–3.12 installed, run:
# uv python install 3.12
uv sync
```

## 🧪 Prompt Evaluation
To evaluate prompts, make a copy of the provided Jupyter notebook and run it:

```bash
cd prompt_evaluation
cp evaluation_template.ipynb [your_file_name].ipynb
```

Open `[your_file_name].ipynb` and execute the cells to test with different prompt pairs. 


## ▶️ Run the App
### Start the backend

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger Docs: http://localhost:8000/docs

### Load the Chrome Extension
1. Open Chrome → `chrome://extensions/`
2. Enable **Developer Mode**
3. Click **Load unpacked** and select the extension folder (photoviewer).
4. Open Instagram and start scrolling → the floating window will show detected image URLs.
5. URLs are sent to the backend for CLIP analysis and may trigger intervention mechanisms [TODO].
