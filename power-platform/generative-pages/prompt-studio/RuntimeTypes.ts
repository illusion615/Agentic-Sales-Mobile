// ---------------- Type Definitions which can be imported from ./RuntimeTypes -------------------------
export interface TableRegistrations extends BaseTableRegistrations {
    "crf5c_promptcase": crf5c_promptcase,
    "crf5c_promptrevision": crf5c_promptrevision,
    "crf5c_promptrun": crf5c_promptrun,
    "crf5c_prompttemplate": crf5c_prompttemplate,
    "msdyn_aievent": msdyn_aievent,
}
export interface EnumRegistrations extends BaseEnumRegistrations {
    "crf5c_promptcase-crf5c_enabled": crf5c_promptcase_crf5c_enabled,
    "crf5c_promptcase-statecode": crf5c_promptcase_statecode,
    "crf5c_promptcase-statuscode": crf5c_promptcase_statuscode,
    "crf5c_promptrevision-crf5c_iscurrent": crf5c_promptrevision_crf5c_iscurrent,
    "crf5c_promptrevision-statecode": crf5c_promptrevision_statecode,
    "crf5c_promptrevision-statuscode": crf5c_promptrevision_statuscode,
    "crf5c_promptrun-statecode": crf5c_promptrun_statecode,
    "crf5c_promptrun-statuscode": crf5c_promptrun_statuscode,
    "crf5c_prompttemplate-crf5c_ispublished": crf5c_prompttemplate_crf5c_ispublished,
    "crf5c_prompttemplate-statecode": crf5c_prompttemplate_statecode,
    "crf5c_prompttemplate-statuscode": crf5c_prompttemplate_statuscode,
    "msdyn_aievent-msdyn_consumptionsource": msdyn_aievent_msdyn_consumptionsource,
    "msdyn_aievent-msdyn_processingstatus": msdyn_aievent_msdyn_processingstatus,
    "msdyn_aievent-msdyn_quicktest": msdyn_aievent_msdyn_quicktest,
    "msdyn_aievent-statecode": msdyn_aievent_statecode,
    "msdyn_aievent-statuscode": msdyn_aievent_statuscode,
}
export type crf5c_promptcase = TableRow<{
    // Primary Key Column
    readonly crf5c_promptcaseid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    crf5c_app: string,
    crf5c_checktype: string,
    crf5c_enabled: crf5c_promptcase_crf5c_enabled,
    crf5c_expectation: string,
    crf5c_name: string,
    crf5c_notes: string,
    crf5c_promptkey: string,
    crf5c_variables: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _organizationid_value: `/organization(${string})`,
    readonly organizationidname: string,
    statecode: crf5c_promptcase_statecode,
    statuscode: crf5c_promptcase_statuscode,
}>

export type crf5c_promptrevision = TableRow<{
    // Primary Key Column
    readonly crf5c_promptrevisionid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    crf5c_app: string,
    crf5c_author: string,
    crf5c_body: string,
    crf5c_iscurrent: crf5c_promptrevision_crf5c_iscurrent,
    crf5c_name: string,
    crf5c_notes: string,
    crf5c_promptkey: string,
    crf5c_promptversion: number,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _organizationid_value: `/organization(${string})`,
    readonly organizationidname: string,
    statecode: crf5c_promptrevision_statecode,
    statuscode: crf5c_promptrevision_statuscode,
}>

export type crf5c_promptrun = TableRow<{
    // Primary Key Column
    readonly crf5c_promptrunid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    crf5c_app: string,
    crf5c_baselinerunid: string,
    crf5c_candidatebody: string,
    crf5c_error: string,
    crf5c_label: string,
    crf5c_name: string,
    crf5c_output: string,
    crf5c_promptkey: string,
    crf5c_promptversion: number,
    crf5c_renderedprompt: string,
    crf5c_source: string,
    crf5c_status: string,
    crf5c_traceid: string,
    crf5c_variables: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _organizationid_value: `/organization(${string})`,
    readonly organizationidname: string,
    statecode: crf5c_promptrun_statecode,
    statuscode: crf5c_promptrun_statuscode,
}>

export type crf5c_prompttemplate = TableRow<{
    // Primary Key Column
    readonly crf5c_prompttemplateid: string,
    readonly createdbyname: string,
    readonly createdbyyominame: string,
    readonly createdonbehalfbyname: string,
    readonly createdonbehalfbyyominame: string,
    crf5c_app: string,
    crf5c_body: string,
    crf5c_contractversion: number,
    crf5c_description: string,
    crf5c_ispublished: crf5c_prompttemplate_crf5c_ispublished,
    crf5c_modeltier: string,
    crf5c_name: string,
    crf5c_notes: string,
    crf5c_promptversion: number,
    crf5c_responseformat: string,
    crf5c_variables: string,
    readonly modifiedbyname: string,
    readonly modifiedbyyominame: string,
    readonly modifiedonbehalfbyname: string,
    readonly modifiedonbehalfbyyominame: string,
    // Foreign Key Column
    readonly _organizationid_value: `/organization(${string})`,
    readonly organizationidname: string,
    statecode: crf5c_prompttemplate_statecode,
    statuscode: crf5c_prompttemplate_statuscode,
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

const enum crf5c_promptcase_crf5c_enabled {
"No" = 0,
"Yes" = 1,
}
const enum crf5c_promptcase_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum crf5c_promptcase_statuscode {
"Active" = 1,
"Inactive" = 2,
}
const enum crf5c_promptrevision_crf5c_iscurrent {
"No" = 0,
"Yes" = 1,
}
const enum crf5c_promptrevision_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum crf5c_promptrevision_statuscode {
"Active" = 1,
"Inactive" = 2,
}
const enum crf5c_promptrun_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum crf5c_promptrun_statuscode {
"Active" = 1,
"Inactive" = 2,
}
const enum crf5c_prompttemplate_crf5c_ispublished {
"No" = 0,
"Yes" = 1,
}
const enum crf5c_prompttemplate_statecode {
"Active" = 0,
"Inactive" = 1,
}
const enum crf5c_prompttemplate_statuscode {
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
