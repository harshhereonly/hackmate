# HackMate Backend Setup Guide

## Prerequisites

### 1. Install Python 3.8+
Download and install Python from: https://www.python.org/downloads/

**Important:** During installation, make sure to check:
- ✅ "Add Python to PATH"
- ✅ "Install pip" (usually checked by default)

### 2. Verify Installation
After installation, open a new PowerShell terminal and run:
```powershell
python --version
pip --version
```

## Backend Setup

### 1. Navigate to Backend Directory
```powershell
cd "e:\HACK MATE\backend"
```

### 2. Create Virtual Environment
```powershell
python -m venv venv
```

### 3. Activate Virtual Environment
```powershell
venv\Scripts\activate
```

### 4. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 5. Configure Environment
```powershell
# Copy the example environment file
cp .env.example .env

# Edit .env file with your settings (optional for development)
# notepad .env
```

### 6. Run Development Server
```powershell
python main.py
```

Or with uvicorn directly:
```powershell
uvicorn main:app --reload
```

## API Access

- **API Base URL**: `http://localhost:8000`
- **Swagger Documentation**: `http://localhost:8000/docs`
- **ReDoc Documentation**: `http://localhost:8000/redoc`

## Troubleshooting

### Common Issues:

1. **"python is not recognized"**
   - Reinstall Python and ensure "Add to PATH" is checked
   - Or use full path: `C:\Python311\python.exe`

2. **"pip is not recognized"**
   - Pip should be installed with Python
   - Try: `python -m pip install -r requirements.txt`

3. **Permission errors**
   - Run PowerShell as Administrator
   - Or use: `python -m pip install --user -r requirements.txt`

4. **Port 8000 already in use**
   - Change port in main.py or .env file
   - Or kill process using port 8000

## Next Steps

Once the backend is running, you can:
1. Test the API endpoints
2. Connect your frontend to the backend
3. Implement authentication, projects, and requests APIs

## Development Commands

```powershell
# Activate virtual environment
venv\Scripts\activate

# Install new packages
pip install package-name

# Update requirements.txt
pip freeze > requirements.txt

# Run with auto-reload
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```