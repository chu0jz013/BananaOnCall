package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/banana/bananaoncall/internal/domain"
	"github.com/banana/bananaoncall/internal/httpapi"
	"github.com/banana/bananaoncall/internal/integrations/telegram"
	"github.com/banana/bananaoncall/internal/service"
	"github.com/banana/bananaoncall/internal/store"
)

func main() {
	incidentStore := store.NewIncidentStore()
	incidentSvc := service.NewIncidentService(incidentStore)
	incidentSvc.Notifiers = append(incidentSvc.Notifiers, telegram.Notifier{Token: os.Getenv("TELEGRAM_BOT_TOKEN"), ChatID: os.Getenv("TELEGRAM_CHAT_ID")})

	loc, _ := time.LoadLocation("Asia/Ho_Chi_Minh")
	rotation := domain.Rotation{Team: "platform", Members: []string{"Nam", "Hai", "Cao", "Thuc"}, StartsAt: time.Date(2026, 8, 10, 9, 0, 0, 0, loc), ShiftDuration: 7 * 24 * time.Hour}
	api := &httpapi.Server{Incidents: incidentSvc, Rotation: rotation}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	srv := &http.Server{Addr: ":" + port, Handler: api.Handler(), ReadHeaderTimeout: 5 * time.Second}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	go func() {
		slog.Info("bananaoncall API listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("http server", "error", err)
			os.Exit(1)
		}
	}()
	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}
