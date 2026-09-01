package domain

// Contact is how one person is reached on one channel — the
// `USER#<id> / CONTACT#telegram` item.
type Contact struct {
	UserID   string `json:"userId"`
	Channel  string `json:"channel"`
	ChatID   string `json:"chatId"`
	Username string `json:"username"`
}

// ChannelTelegram is the only channel in the MVP (D8).
const ChannelTelegram = "telegram"

// FallbackUserID receives an alert when the rota has nobody in it.
//
// FR-4.6 exists because this is the failure mode everyone forgets: an empty
// calendar or a broken sync must page *somebody*, never nobody. The caller is
// expected to log loudly when it lands here.
const FallbackUserID = "admin"
