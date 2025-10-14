from fastapi import APIRouter
from fastapi.responses import HTMLResponse

router = APIRouter()

@router.get("/", response_class=HTMLResponse)
def root():
    """
    Home Page
    """
    html_content = """
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Body Image Analysis API</title>
        <style>
            body {
                font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
                background-color: #fff;
                color: #111;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
            }
            h1 {
                font-size: 2.8rem;
                margin-bottom: 0.8rem;
                letter-spacing: 0.5px;
            }
            p {
                font-size: 1.15rem;
                color: #444;
                margin: 0;
                line-height: 1.6;
                margin-bottom: 2rem; /* 增加與按鈕距離 */
            }
            a {
                color: #111;
                text-decoration: none;
                border: 1.5px solid #111;
                padding: 10px 20px;
                border-radius: 8px;
                font-weight: 500;
                transition: all 0.25s ease;
            }
            a:hover {
                background-color: #111;
                color: #fff;
            }
            footer {
                position: absolute;
                bottom: 16px;
                font-size: 0.9rem;
                color: #888;
            }
        </style>
    </head>
    <body>
        <main>
            <h1>Body Image Analysis API</h1>
            <p>CLIP-based visual analysis for social media research</p>
            <a href="/docs">View API Docs</a>
        </main>
        <footer>
            <p>© 2025 Body Image Project · FastAPI · Hugging Face</p>
        </footer>
    </body>
    </html>
    """
    return HTMLResponse(content=html_content)