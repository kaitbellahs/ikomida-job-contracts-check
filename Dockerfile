FROM  google/cloud-sdk:alpine AS build

ARG PROJECT_ID
ARG GOOGLE_SERVICE_ACCOUNT
ENV GOOGLE_APPLICATION_CREDENTIALS /job/serviceAccount.json

RUN mkdir -p /job 
WORKDIR /job

RUN apk update && apk --no-cache -U upgrade && apk add --no-cache npm && npm --global i yarn patch-package && echo $GOOGLE_SERVICE_ACCOUNT > /job/serviceAccount_b64 && base64 -d /job/serviceAccount_b64 > $GOOGLE_APPLICATION_CREDENTIALS && gcloud auth activate-service-account --key-file $GOOGLE_APPLICATION_CREDENTIALS && export PATH="$(yarn global bin):$PATH" && yarn global add google-artifactregistry-auth

RUN echo "@ikomida:registry=https://us-central1-npm.pkg.dev/$PROJECT_ID/node/" >> .npmrc && echo "//us-central1-npm.pkg.dev/$PROJECT_ID/node/:always-auth=true" >> .npmrc

COPY package.json .eslintignore .prettierrc api-extractor.json rollup.config.js tsconfig.json yarn.lock ./
RUN yarn glogin && yarn --frozen-lockfile

COPY ./src /job/src
RUN yarn build && yarn install --production

FROM node:16-alpine AS final

ENV NODE_ENV production

RUN apk update && apk --no-cache -U upgrade && addgroup -g 3000  ikomida && deluser --remove-home node && adduser -u 1000 -G ikomida -s /bin/sh -D -h /job ikomida && chown 1000:3000 /job
USER ikomida
WORKDIR /job

COPY --chown=ikomida:ikomida --from=build /job/package.json ./
COPY --chown=ikomida:ikomida --from=build /job/node_modules ./node_modules/
COPY --chown=ikomida:ikomida --from=build /job/build ./build/

ENTRYPOINT ["node", "--enable-source-maps", "build/job.js"]