/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "crf5c_account1s": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_account1id",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_activity1s": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_activity1id",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_agentlogs": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_agentlogid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_aisummaries": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_aisummaryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_briefings": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_briefingid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_businessinsights": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_businessinsightid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_contacts": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_contactid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_copilotconversations": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_copilotconversationid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_opportunity1s": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_opportunity1id",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_products": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_productid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crf5c_settings": {
    "tableId": "",
    "version": "",
    "primaryKey": "crf5c_settingid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "powerappsflow_llm": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Connector",
    "apis": {
      "Run": {
        "path": "/{connectionId}/triggers/manual/run",
        "method": "POST",
        "parameters": [
          {
            "name": "connectionId",
            "in": "path",
            "required": true,
            "type": "string"
          },
          {
            "name": "input",
            "in": "body",
            "required": true,
            "type": "object"
          },
          {
            "name": "api-version",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          },
          "default": {
            "type": "object"
          }
        }
      }
    }
  }
};
