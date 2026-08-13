FROM golang:1.23 AS build
WORKDIR /src
COPY go.mod ./
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/bananaoncall ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/bananaoncall /bananaoncall
EXPOSE 8080
ENTRYPOINT ["/bananaoncall"]
