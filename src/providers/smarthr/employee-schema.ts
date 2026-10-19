import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";

const employeeFileSchema = s.object(
  "A file downloaded by Connector and attached to SmartHR. The maximum unencoded size is 10 MiB.",
  {
    fileUrl: s.url("Public HTTP(S) URL of the file."),
    fileName: s.string(
      "File name with extension. Supported: png, jpeg, jpg, pdf, text, txt, csv, conf, log, docx, doc, xlsx, xls, gif.",
      { minLength: 1 },
    ),
  },
  { required: ["fileUrl", "fileName"] },
);

const employeeAddressSchema = s.object(
  "Postal address.",
  {
    country_number: s.string("Country code."),
    zip_code: s.string("Postal code."),
    pref: s.string("Prefecture or province."),
    city: s.string("City or municipality."),
    street: s.string("Street address."),
    building: s.string("Building name and room number."),
    literal_yomi: s.string("Phonetic reading of the address."),
  },
  { required: ["city"] },
);

const employeeBankAccountSchema = s.object(
  "Employee bank account.",
  {
    bank_code: s.string("Bank code."),
    bank_branch_code: s.string("Bank branch code."),
    account_type: s.stringEnum("Bank account type.", ["saving", "checking", "deposit"]),
    account_number: s.string("Bank account number."),
    account_holder_name: s.string("Account holder name in katakana."),
    transfer_type: s.stringEnum("Transfer allocation type.", ["full", "specified", "remaining"]),
    specified_transfer_amount: s.integer("Fixed transfer amount."),
    transfer_category: s.stringEnum("Whether the account receives salary, bonus, or both.", [
      "salary_and_bonus",
      "salary",
      "bonus",
    ]),
    bankbook_image: s.describe(employeeFileSchema, "Bank account evidence attachment."),
    bank_account_setting_id: s.string("Bank account setting ID."),
  },
  {
    required: ["bank_code", "bank_branch_code", "account_type", "account_number", "account_holder_name"],
  },
);

const employeeCustomFieldSchema = {
  ...s.object(
    "One custom field value or file attachment.",
    {
      template_id: s.string("Custom field template ID.", { minLength: 1 }),
      value: s.nullable(
        s.union(
          [s.string("Text, date, or dropdown element ID or physical name."), s.number("Numeric custom field value.")],
          { description: "Value matching the custom field type; null requests clearing." },
        ),
      ),
      file: s.describe(employeeFileSchema, "File for a custom field of type file."),
    },
    { required: ["template_id"] },
  ),
  not: { required: ["value", "file"] },
};

export const employeeAttachmentFields: string[] = [
  "profile_image",
  "resume1",
  "resume2",
  "identity_card_image1",
  "identity_card_image2",
  "address_image",
  "emp_ins_insured_person_number_image",
  "basic_pension_number_image",
  "foreign_resident_card_image1",
  "foreign_resident_card_image2",
  "handicapped_image",
  "student_card_image",
];
export const employeeWriteSchema: JsonSchema = s.object(
  "Employee fields using official SmartHR names. Omitted fields are unchanged on update. Null requests clearing, subject to SmartHR restrictions on populated identity fields.",
  {
    emp_status: s.nullable(s.stringEnum("Employment status.", ["employed", "absent", "retired"])),
    user_id: s.nullable(s.string("Associated SmartHR user ID.")),
    biz_establishment_id: s.nullable(s.string("Business establishment ID.")),
    emp_code: s.nullable(s.string("Employee number.")),
    last_name: s.nullable(s.string("Legal family name.")),
    first_name: s.nullable(s.string("Legal given name.")),
    last_name_yomi: s.nullable(s.string("Legal family name in katakana.")),
    first_name_yomi: s.nullable(s.string("Legal given name in katakana.")),
    business_last_name: s.nullable(s.string("Family name used at work.")),
    business_first_name: s.nullable(s.string("Given name used at work.")),
    business_last_name_yomi: s.nullable(s.string("Work family name in katakana.")),
    business_first_name_yomi: s.nullable(s.string("Work given name in katakana.")),
    birth_at: s.nullable(s.string("Date of birth.", { format: "date" })),
    gender: s.nullable(s.stringEnum("Legal gender.", ["male", "female"])),
    tel_number: s.nullable(s.string("Telephone number.")),
    address: s.nullable(s.describe(employeeAddressSchema, "Current residential address.")),
    address_head_of_family: s.nullable(s.string("Head of household at the current address.")),
    address_relation_name: s.nullable(s.string("Relationship to the head of household.")),
    email: s.nullable(s.string("Employee email address; invitations are sent to this address.")),
    emergency_relation_name: s.nullable(s.string("Relationship to the emergency contact.")),
    emergency_last_name: s.nullable(s.string("Emergency contact family name.")),
    emergency_first_name: s.nullable(s.string("Emergency contact given name.")),
    emergency_last_name_yomi: s.nullable(s.string("Emergency contact family name in katakana.")),
    emergency_first_name_yomi: s.nullable(s.string("Emergency contact given name in katakana.")),
    emergency_tel_number: s.nullable(s.string("Emergency contact telephone number.")),
    emergency_address: s.nullable(s.describe(employeeAddressSchema, "Emergency contact address.")),
    resident_card_address: s.nullable(s.describe(employeeAddressSchema, "Address on the resident record.")),
    resident_card_address_head_of_family: s.nullable(s.string("Head of household on the resident record.")),
    resident_card_address_relation_name: s.nullable(
      s.string("Relationship to the head of household on the resident record."),
    ),
    positions: s.nullable(s.array("Job title names, not job title IDs.", s.string("One name or identifier."))),
    grade: s.nullable(s.string("Grade name, not a grade ID.")),
    job_category: s.nullable(s.string("Job category name, not a category ID.")),
    occupation: s.nullable(s.string("Description of the employee's work.")),
    entered_at: s.nullable(s.string("Employment start date.", { format: "date" })),
    resigned_at: s.nullable(s.string("Resignation date.", { format: "date" })),
    resigned_reason: s.nullable(s.string("Reason for resignation.")),
    recruitment_type: s.nullable(s.string("Recruitment type name, not an ID.")),
    emp_ins_insured_person_number: s.nullable(s.string("Employment insurance insured person number.")),
    emp_ins_insured_person_number_unknown_reason_type: s.nullable(
      s.stringEnum("Reason the employment insurance number is unavailable.", [
        "no_work_experience",
        "never_joined",
        "unknown",
      ]),
    ),
    emp_ins_qualified_at: s.nullable(s.string("Employment insurance qualification date.", { format: "date" })),
    emp_ins_disqualified_at: s.nullable(s.string("Employment insurance disqualification date.", { format: "date" })),
    previous_workplace: s.nullable(s.string("Previous employer under employment insurance.")),
    previous_employment_start_on: s.nullable(
      s.string("Start date at the previous employer under employment insurance.", {
        format: "date",
      }),
    ),
    previous_employment_end_on: s.nullable(
      s.string("End date at the previous employer under employment insurance.", { format: "date" }),
    ),
    soc_ins_insured_person_number: s.nullable(s.integer("Employees' pension insurance reference number.")),
    hel_ins_insured_person_number: s.nullable(s.integer("Health insurance reference number.")),
    basic_pension_number: s.nullable(s.string("Basic pension number.")),
    first_enrolling_in_emp_pns_ins_flag: s.nullable(
      s.boolean("Whether this is the first enrollment in employees' pension insurance."),
    ),
    basic_pension_number_unknown_reason_type: s.nullable(
      s.stringEnum("Reason the basic pension number is unavailable.", ["non_pensionable", "unknown"]),
    ),
    first_workplace: s.nullable(s.string("First employer under employees' pension insurance.")),
    first_workplace_address_text: s.nullable(
      s.string("Address of the first employer under employees' pension insurance."),
    ),
    first_employment_start_on: s.nullable(
      s.string("Start date at the first employer under employees' pension insurance.", {
        format: "date",
      }),
    ),
    first_employment_end_on: s.nullable(
      s.string("End date at the first employer under employees' pension insurance.", {
        format: "date",
      }),
    ),
    last_workplace: s.nullable(s.string("Last employer under employees' pension insurance.")),
    last_workplace_address_text: s.nullable(
      s.string("Address of the last employer under employees' pension insurance."),
    ),
    last_employment_start_on: s.nullable(
      s.string("Start date at the last employer under employees' pension insurance.", {
        format: "date",
      }),
    ),
    last_employment_end_on: s.nullable(
      s.string("End date at the last employer under employees' pension insurance.", {
        format: "date",
      }),
    ),
    employees_pension_insurance_qualified_at: s.nullable(
      s.string("Employees' pension insurance qualification date.", { format: "date" }),
    ),
    employees_pension_insurance_disqualified_at: s.nullable(
      s.string("Employees' pension insurance disqualification date.", { format: "date" }),
    ),
    health_insurance_qualified_at: s.nullable(s.string("Health insurance qualification date.", { format: "date" })),
    health_insurance_disqualified_at: s.nullable(
      s.string("Health insurance disqualification date.", { format: "date" }),
    ),
    insurance_premium_calculation_type: s.nullable(
      s.stringEnum("Social insurance premium calculation method used for payroll.", ["rate", "fixed"]),
    ),
    health_insurance_premium_company: s.nullable(s.integer("Employer share of the health insurance premium.")),
    health_insurance_premium_individual: s.nullable(s.integer("Employee share of the health insurance premium.")),
    care_insurance_premium_company: s.nullable(s.integer("Employer share of the long-term care insurance premium.")),
    care_insurance_premium_individual: s.nullable(s.integer("Employee share of the long-term care insurance premium.")),
    child_care_support_fund_company: s.nullable(s.integer("Employer share of the child and childcare support fund.")),
    child_care_support_fund_individual: s.nullable(
      s.integer("Employee share of the child and childcare support fund."),
    ),
    employees_pension_insurance_premium_company: s.nullable(
      s.integer("Employer share of the employees' pension insurance premium."),
    ),
    employees_pension_insurance_premium_individual: s.nullable(
      s.integer("Employee share of the employees' pension insurance premium."),
    ),
    child_care_contribution: s.nullable(s.integer("Childcare contribution amount.")),
    having_spouse: s.nullable(s.boolean("Whether the employee has a spouse.")),
    spouse_yearly_income: s.nullable(s.integer("Spouse's annual income.")),
    monthly_income_currency: s.nullable(s.integer("Monthly remuneration paid in money.")),
    monthly_income_goods: s.nullable(s.integer("Monthly remuneration paid in kind.")),
    monthly_base_salary: s.nullable(s.integer("Monthly base salary.")),
    monthly_standard_income_updated_at: s.nullable(
      s.string("Revision date of standard monthly remuneration.", { format: "date" }),
    ),
    monthly_standard_income_hel: s.nullable(s.integer("Standard monthly remuneration for health insurance.")),
    monthly_standard_income_pns: s.nullable(
      s.integer("Standard monthly remuneration for employees' pension insurance."),
    ),
    nearest_station_and_line: s.nullable(s.string("Commuting route.")),
    commutation_1_expenses: s.nullable(s.integer("Commuting allowance 1 season-ticket cost.")),
    commutation_1_period: s.nullable(
      s.stringEnum("Commuting allowance 1 ticket period.", [
        "commutation_period_1_month",
        "commutation_period_3_month",
        "commutation_period_6_month",
      ]),
    ),
    commutation_1_single_fare: s.nullable(s.integer("Commuting allowance 1 one-way fare.")),
    commutation_2_expenses: s.nullable(s.integer("Commuting allowance 2 season-ticket cost.")),
    commutation_2_period: s.nullable(
      s.stringEnum("Commuting allowance 2 ticket period.", [
        "commutation_period_1_month",
        "commutation_period_3_month",
        "commutation_period_6_month",
      ]),
    ),
    commutation_2_single_fare: s.nullable(s.integer("Commuting allowance 2 one-way fare.")),
    foreign_resident_last_name: s.nullable(s.string("Family name in foreign residence records.")),
    foreign_resident_first_name: s.nullable(s.string("Given name in foreign residence records.")),
    foreign_resident_middle_name: s.nullable(s.string("Middle name in foreign residence records.")),
    foreign_resident_card_number: s.nullable(s.string("Residence card number.")),
    nationality_code: s.nullable(s.string("Nationality or country code.")),
    resident_status_type: s.nullable(s.string("Residence status.")),
    resident_status_other_reason: s.nullable(s.string("Reason the residence status is unknown.")),
    resident_end_at: s.nullable(s.string("Residence permission expiry date.", { format: "date" })),
    having_ex_activity_permission: s.nullable(
      s.stringEnum("Permission to engage in activities outside the residence status.", ["permitted", "none"]),
    ),
    other_be_workable_type: s.nullable(
      s.stringEnum("Dispatch or contract work classification.", ["other_be_workable", "others"]),
    ),
    contract_type: s.nullable(s.stringEnum("Employment contract term type.", ["unlimited", "fixed_term"])),
    contract_start_on: s.nullable(s.string("Contract start date.", { format: "date" })),
    contract_end_on: s.nullable(s.string("Contract end date.", { format: "date" })),
    contract_renewal_type: s.nullable(s.stringEnum("Contract renewal policy.", ["renewal", "none", "auto_renewal"])),
    tax_cd: s.nullable(
      s.stringEnum("Income tax withholding classification.", [
        "kou",
        "otsu",
        "hei",
        "reward",
        "non_resident",
        "no_taxation_required",
      ]),
    ),
    handicapped_type: s.nullable(
      s.stringEnum("Disability classification.", ["ordinary_handicapped", "special_handicapped"]),
    ),
    handicapped_note_type: s.nullable(s.string("Disability certificate type.")),
    handicapped_note_delivery_at: s.nullable(s.string("Disability certificate issue date.", { format: "date" })),
    working_student_flag: s.nullable(s.boolean("Whether the employee qualifies as a working student.")),
    school_name: s.nullable(s.string("School attended by the working student.")),
    enrolled_at: s.nullable(s.string("School enrollment date.", { format: "date" })),
    working_student_income: s.nullable(s.integer("Estimated income of the working student.")),
    employment_income_flag: s.nullable(s.boolean("Whether the employee has employment income.")),
    business_income_flag: s.nullable(s.boolean("Whether the employee has business income.")),
    devidend_income_flag: s.nullable(
      s.boolean("Whether the employee has dividend income; the upstream field spelling is preserved."),
    ),
    estate_income_flag: s.nullable(s.boolean("Whether the employee has real estate income.")),
    widow_type: s.nullable(s.stringEnum("Widow or single-parent classification.", ["widow", "single_parent"])),
    widow_reason_type: s.nullable(
      s.stringEnum("Reason for the widow or single-parent classification.", [
        "divorce",
        "bereavement",
        "missing",
        "unmarried",
      ]),
    ),
    widow_memo: s.nullable(s.string("Notes about the widow or single-parent classification.")),
    employment_type_id: s.nullable(s.string("Employment type ID.")),
    department_ids: s.nullable(
      s.array("Department IDs assigned to the employee.", s.string("One name or identifier.")),
    ),
    payment_period_id: s.nullable(s.string("Payment period ID.")),
    profile_image: s.nullable(s.describe(employeeFileSchema, "Profile image attachment.")),
    resume1: s.nullable(s.describe(employeeFileSchema, "Resume or work-history attachment 1.")),
    resume2: s.nullable(s.describe(employeeFileSchema, "Resume or work-history attachment 2.")),
    identity_card_image1: s.nullable(s.describe(employeeFileSchema, "Identity document attachment 1.")),
    identity_card_image2: s.nullable(s.describe(employeeFileSchema, "Identity document attachment 2.")),
    address_image: s.nullable(s.describe(employeeFileSchema, "Proof of address attachment.")),
    emp_ins_insured_person_number_image: s.nullable(
      s.describe(employeeFileSchema, "Employment insurance number evidence attachment."),
    ),
    basic_pension_number_image: s.nullable(s.describe(employeeFileSchema, "Basic pension number evidence attachment.")),
    foreign_resident_card_image1: s.nullable(s.describe(employeeFileSchema, "Residence card attachment 1.")),
    foreign_resident_card_image2: s.nullable(s.describe(employeeFileSchema, "Residence card attachment 2.")),
    handicapped_image: s.nullable(s.describe(employeeFileSchema, "Disability certificate attachment.")),
    student_card_image: s.nullable(s.describe(employeeFileSchema, "Student ID attachment.")),
    bank_accounts: s.nullable(
      s.array(
        "Bank accounts. Either every entry supplies bank_account_setting_id, or none does; otherwise SmartHR rejects the request.",
        employeeBankAccountSchema,
      ),
    ),
    custom_fields: s.nullable(
      s.array(
        "Custom field values. Dropdown values accept an element ID or physical name; file fields use file.",
        employeeCustomFieldSchema,
      ),
    ),
  },
  { required: [] },
);
