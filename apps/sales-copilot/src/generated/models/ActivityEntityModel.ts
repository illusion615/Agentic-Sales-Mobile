/*!
 * Native Dataverse Activity entity models.
 * appointment = visit / meeting
 * phonecall = call
 * email = email
 *
 * All share `activityid` as primary key and common fields via activitypointer.
 */

/** Common fields shared by all activity types via activitypointer */
export interface ActivityEntityBase {
  activityid: string;
  subject?: string;
  description?: string;
  scheduledstart?: string;
  scheduledend?: string;
  statecode?: number;    // 0=Open, 1=Completed, 2=Canceled
  statuscode?: number;
  createdon?: string;
  modifiedon?: string;
  _ownerid_value?: string;
  _regardingobjectid_value?: string;
  regardingobjectidtypecode?: string; // 'account' | 'opportunity' | etc.
  regardingobjectidname?: string;
}

export interface AppointmentEntity extends ActivityEntityBase {
  location?: string;
  isalldayevent?: boolean;
}

export interface PhonecallEntity extends ActivityEntityBase {
  phonenumber?: string;
  directioncode?: boolean; // true=outgoing, false=incoming
}

export interface EmailEntity extends ActivityEntityBase {
  torecipients?: string;
  sender?: string;
}
