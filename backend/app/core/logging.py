import logging


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    if not root.handlers:
        logging.basicConfig(
            level=level.upper(),
            format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        )
    else:
        root.setLevel(level.upper())
    # Keep third-party chatter down; request logs come from uvicorn.
    logging.getLogger("pymongo").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)
