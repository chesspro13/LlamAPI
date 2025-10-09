VERSION="0.2.5"

yarn tsc

docker build . -t  "chesspro13/llamapi:standalone" --no-cache
