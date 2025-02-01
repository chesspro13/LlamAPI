FROM node:alpine3.20

WORKDIR /app

COPY package.json /app
COPY yarn.lock /app

COPY --chown=node:node ./dist/* /app
COPY --chown=node:node ./src /app

RUN yarn install 

USER node

EXPOSE 27415

CMD ["yarn", "run", "server-ts"]