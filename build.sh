VERSION="0.2.3"

tsc

docker build . -t  "chesspro13/llamapi"
docker build . -t  "chesspro13/llamapi:v${VERSION}"

docker push "chesspro13/llamapi"
docker push "chesspro13/llamapi:v${VERSION}"
