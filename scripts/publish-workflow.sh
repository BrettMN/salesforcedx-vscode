#!/usr/bin/env bash
CircleCIToken=$1
curl -v -u ${CircleCIToken}: -X POST --header "Content-Type: application/json" -d '{
  "branch": "master",
  "parameters": {
    "publish": true
  }
}' https://circleci.com/api/v2/project/gh/forcedotcom/salesforcedx-vscode/pipeline
