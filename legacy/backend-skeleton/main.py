from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

load_dotenv()

app = FastAPI(
    title="HackMate API",
    description="Backend API for HackMate - Find Your Hackathon Team",
    version="1.0.0"
)

# Enable CORS for frontend
origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {
        "message": "Welcome to HackMate API",
        "status": "running",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Import routers here
# from app.routers import users, projects, requests
# app.include_router(users.router, prefix="/api/users", tags=["users"])
# app.include_router(projects.router, prefix="/api/projects", tags=["projects"])
# app.include_router(requests.router, prefix="/api/requests", tags=["requests"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
