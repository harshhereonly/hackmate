from app.schemas.common import APIModel, UTCDateTime


class NotificationOut(APIModel):
    id: str
    type: str
    title: str
    body: str = ""
    link: str | None = None
    read: bool
    created_at: UTCDateTime


class UnreadCount(APIModel):
    count: int
