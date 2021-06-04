ARG build_arch=amd64

FROM multiarch/alpine:${build_arch}-v3.12

RUN addgroup -g 1000 node && adduser -u 1000 -G node -s /bin/sh -D node && apk add --no-cache nodejs

WORKDIR /home/node

COPY app.js itroxs.js package.json LICENSE /home/node/

RUN apk add --no-cache git npm && npm install && apk del git npm

USER node

CMD [ "node", "." ]
