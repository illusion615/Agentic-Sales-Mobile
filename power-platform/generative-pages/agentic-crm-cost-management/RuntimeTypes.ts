// ---------------- Type Definitions which can be imported from ./RuntimeTypes -------------------------
export interface TableRegistrations extends BaseTableRegistrations {
    "crf5c_agentlog": crf5c_agentlog,
    "msdyn_aievent": msdyn_aievent,
}
export interface EnumRegistrations extends BaseEnumRegistrations {
    "crf5c_agentlog-statecode": crf5c_agentlog_statecode,
    "crf5c_agentlog-statuscode": crf5c_agentlog_statuscode,
    "msdyn_aievent-msdyn_consumptionsource": msdyn_aievent_msdyn_consumptionsource,
    "msdyn_aievent-msdyn_processingstatus": msdyn_aievent_msdyn_processingstatus,
    "msdyn_aievent-msdyn_quicktest": msdyn_aievent_msdyn_quicktest,
    "msdyn_aievent-statecode": msdyn_aievent_statecode,
    "msdyn_aievent-statuscode": msdyn_aievent_statuscode,
}
export type crf5c_agentlog = TableRow<{
    // Primary Key Column
    readonly crf5c_agentlogid: string,
    biz_aieventtracelist: string,
    biz_allocationmethod: string,
    biz_copilotcreditsconsumed: number,
    biz_creditsconsumed: number,
    biz_operationindex: number,
    biz_operationtype: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    crf5c_agentname: string,
    crf5c_logname: string,
    crf5c_querytext: string,
    crf5c_responsetext: string,
    crf5c_sessionid: string,
    crf5c_sourcedescription: string,
    crf5c_timestamp: Date,
    crf5c_userid: string,
    crf5c_username: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    readonly owningbusinessunitname: string,
    statecode: crf5c_agentlog_statecode,
    statuscode: crf5c_agentlog_statuscode,
}>

export type msdyn_aievent = TableRow<{
    // Primary Key Column
    readonly msdyn_aieventid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _msdyn_aiconfigurationid_value: `/msdyn_aiconfiguration(${string})`,
    readonly msdyn_aiconfigurationidname: string,
    // Foreign Key Column
    readonly _msdyn_aimodelid_value: `/msdyn_aimodel(${string})`,
    readonly msdyn_aimodelidname: string,
    msdyn_approvalid: string,
    msdyn_automationlink: string,
    msdyn_automationname: string,
    msdyn_consumptionsource: msdyn_aievent_msdyn_consumptionsource,
    msdyn_creditconsumed: number,
    msdyn_datainfo: string,
    readonly msdyn_datainfofile_name: string,
    msdyn_datatype: string,
    msdyn_eventdata: string,
    msdyn_name: string,
    msdyn_output: string,
    readonly msdyn_outputfile_name: string,
    msdyn_partnersource: string,
    msdyn_processingdate: Date,
    msdyn_processingstatus: msdyn_aievent_msdyn_processingstatus,
    msdyn_quicktest: msdyn_aievent_msdyn_quicktest,
    readonly owningbusinessunitname: string,
    statecode: msdyn_aievent_statecode,
    statuscode: msdyn_aievent_statuscode,
}>

const enum crf5c_agentlog_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum crf5c_agentlog_statuscode {
"Active" = 1,
"Inactive" = 2,
}
const enum msdyn_aievent_msdyn_consumptionsource {
"PowerAutomation" = 0,
"PowerApps" = 1,
"API" = 2,
"MCS" = 3,
}
const enum msdyn_aievent_msdyn_processingstatus {
"Processed" = 0,
"Failed" = 1,
"Processing" = 2,
}
const enum msdyn_aievent_msdyn_quicktest {
"No" = 0,
"Yes" = 1,
}
const enum msdyn_aievent_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum msdyn_aievent_statuscode {
"Active" = 1,
"Inactive" = 2,
}

export interface UxAgentDataApi extends BaseUxAgentDataApi<TableRegistrations, EnumRegistrations> {}

export interface GeneratedComponentProps {
    dataApi: UxAgentDataApi;
}
