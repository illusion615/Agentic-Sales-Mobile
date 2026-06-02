/*!
 * Native Dataverse Contact entity model.
 * Maps to the standard `contacts` entity set (logical name: `contact`).
 */

export interface ContactEntityBase {
  contactid: string;
  fullname?: string;         // Read-only (auto: firstname + lastname)
  firstname?: string;
  lastname?: string;
  emailaddress1?: string;
  telephone1?: string;
  jobtitle?: string;
}

export interface ContactEntity extends ContactEntityBase {
  createdon?: string;
  modifiedon?: string;
  _parentcustomerid_value?: string;
  parentcustomeridname?: string;
  _ownerid_value?: string;
}
