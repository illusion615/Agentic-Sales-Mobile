/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "crf5c_agentlogs": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_agentlogid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "msdyn_aimodels": {
    "tableId": "",
    "version": "",
    "primaryKey": "msdyn_aimodelid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "environmentvariabledefinitions": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariabledefinitionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "environmentvariablevalues": {
    "tableId": "",
    "version": "",
    "primaryKey": "environmentvariablevalueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "new_5famap_20static_20map_5f795669e27c19e6e2": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "GetStaticMap": {
        "path": "/{connectionId}/staticmap",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "key",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "location",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "zoom",
            "in": "query",
            "required": true,
            "type": "integer"
          },
          {
            "name": "size",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "scale",
            "in": "query",
            "required": false,
            "type": "integer"
          },
          {
            "name": "traffic",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      },
      "GetDrivingRoute": {
        "path": "/{connectionId}/direction/driving",
        "method": "GET",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "key",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "origin",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "destination",
            "in": "query",
            "required": true,
            "type": "string"
          },
          {
            "name": "strategy",
            "in": "query",
            "required": false,
            "type": "integer"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "void"
          }
        }
      }
    }
  },
  "new_5fsales_20copilot_20speech_5f795669e27c19e6e2": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "Synthesize": {
        "path": "/{connectionId}/tts",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      },
      "Transcribe": {
        "path": "/{connectionId}/stt",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "body",
            "in": "body",
            "required": true,
            "type": "object"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  }
};
