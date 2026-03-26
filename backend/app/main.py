from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.auth import router as auth_router
from app.api.v1.courses import router as courses_router
from app.api.v1.lectures import router as lectures_router
from app.api.v1.questions import router as questions_router
from app.api.v1.videos import router as videos_router

app = FastAPI(
    title="IFL Platform API",
    description="Interactive Flipped Learning Platform Backend",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(courses_router)
app.include_router(lectures_router)
app.include_router(questions_router)
app.include_router(videos_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}
