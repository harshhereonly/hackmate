"""Compatibility entry point kept from the original skeleton.

    python main.py            # dev server with auto-reload on http://127.0.0.1:8000
    uvicorn main:app --reload # same app via uvicorn directly

The application itself lives in app/main.py.
"""

import uvicorn


def __getattr__(name: str):
    if name == "app":
        from app.main import create_app

        application = create_app()
        globals()["app"] = application
        return application
    raise AttributeError(name)


if __name__ == "__main__":
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
