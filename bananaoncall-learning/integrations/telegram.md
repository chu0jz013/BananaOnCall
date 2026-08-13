# Telegram

The backend already contains a minimal outbound notifier using the Bot API.

Exercises:
- Add Markdown-safe messages.
- Add inline ACK/Resolve buttons.
- Expose a callback webhook endpoint.
- Verify callback authenticity / secret path.
- Make notification delivery idempotent.
- Persist attempts, errors, and Telegram message IDs.
