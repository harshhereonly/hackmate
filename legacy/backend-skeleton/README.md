# HackMate Backend - FastAPI

Backend API for HackMate built with Python FastAPI.

## Setup Instructions

### 1. Create Virtual Environment
```bash
python -m venv venv
```

### 2. Activate Virtual Environment
**Windows:**
```bash
venv\Scripts\activate
```

**macOS/Linux:**
```bash
source venv/bin/activate
```

### 3. Install Dependencies
```bash
pip install -r requirements.txt
```

### 4. Configure Environment
Copy `.env.example` to `.env` and update values:
```bash
cp .env.example .env
```

### 5. Run Development Server
```bash
python main.py
```

Or with uvicorn directly:
```bash
uvicorn main:app --reload
```

The API will be available at `http://localhost:8000`

## API Documentation

- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

## Project Structure

```
backend/
├── app/
│   ├── routers/          # API routes (users, projects, requests)
│   ├── models/           # Database models (SQLAlchemy)
│   ├── schemas/          # Pydantic schemas for request/response
│   ├── config.py         # Configuration settings
│   ├── database.py       # Database setup
│   └── __init__.py
├── main.py              # FastAPI app entry point
├── requirements.txt     # Python dependencies
├── .env.example        # Environment variables example
└── README.md
```

## Available Endpoints

### Health Check
- `GET /` - Root endpoint
- `GET /health` - Health check

### Upcoming APIs
- `/api/users` - User management
- `/api/projects` - Project management
- `/api/requests` - Join requests

## Requirements

- Python 3.8+
- FastAPI 0.104+
- SQLAlchemy 2.0+
- PostgreSQL (optional, SQLite by default)
