FROM  google/cloud-sdk:alpine AS build

ARG PORT 80
ARG GOOGLE_SERVICE_ACCOUNT
ENV GOOGLE_APPLICATION_CREDENTIALS /job/jobAccount.json

RUN mkdir -p /job 
WORKDIR /job

RUN apk update && apk --no-cache -U upgrade && apk add --no-cache npm && npm --global i yarn && echo $GOOGLE_SERVICE_ACCOUNT > /job/jobAccount_b64 && base64 -d /job/jobAccount_b64 > $GOOGLE_APPLICATION_CREDENTIALS && gcloud auth activate-service-account --key-file $GOOGLE_APPLICATION_CREDENTIALS && export PATH="$(yarn global bin):$PATH" && yarn global add google-artifactregistry-auth

COPY .npmrc package.json .npmrc .eslintignore .prettierrc api-extractor.json rollup.config.ts tsconfig.json /job/
RUN yarn glogin && yarn install

COPY ./src /job/src
RUN yarn build && yarn install --production

FROM node:16-alpine AS final

ENV NODE_ENV production
ENV NODEPORT ${PORT}

RUN apk update && apk --no-cache -U upgrade && addgroup -g 3000  ikomida && deluser --remove-home node && adduser -u 1000 -G ikomida -s /bin/sh -D -h /job ikomida && chown 1000:3000 /job
USER ikomida
WORKDIR /job

COPY --chown=ikomida:ikomida --from=build /job/package.json ./
COPY --chown=ikomida:ikomida --from=build /job/node_modules ./node_modules/
COPY --chown=ikomida:ikomida --from=build /job/build ./build/

EXPOSE ${PORT}

ENTRYPOINT ["node", "build/job.js"]