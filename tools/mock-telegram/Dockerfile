# The binary is cross-compiled on the host by `make build`, so this image needs
# no Go toolchain and the compose stack stays buildable offline.
FROM alpine:3.22

RUN apk add --no-cache wget
COPY bin/mock-telegram /usr/local/bin/mock-telegram

EXPOSE 8081
ENTRYPOINT ["/usr/local/bin/mock-telegram"]
