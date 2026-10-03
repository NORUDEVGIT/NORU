import type { GuestFieldType } from "./required-fields-card4.server";

export type GuestCreationFieldCategory = "personal" | "contact" | "address";

export type GuestCreationFieldDefinition = {
  code: string;
  name: string;
  category: GuestCreationFieldCategory;
  categoryLabel: string;
  fieldType: GuestFieldType;
  essential: boolean;
  systemRequired?: boolean;
  description: string;
};

export const GUEST_CREATION_CATEGORIES: Array<{
  id: GuestCreationFieldCategory;
  label: string;
  description: string;
}> = [
  {
    id: "personal",
    label: "Personal Details",
    description: "Core personal identity details from the guest creation Basic step.",
  },
  {
    id: "contact",
    label: "Contact Information",
    description: "Phone numbers, email addresses, and communication preferences.",
  },
  {
    id: "address",
    label: "Address Information",
    description: "Residential and geographic location details.",
  },
];

export const INDIVIDUAL_GUEST_CREATION_FIELDS: GuestCreationFieldDefinition[] = [
  // Personal Details (Basic Step)
  {
    code: "FIRST_NAME",
    name: "First Name",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: true,
    systemRequired: true,
    description: "Guest's legal given name.",
  },
  {
    code: "LAST_NAME",
    name: "Last Name",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: true,
    description: "Guest's legal family name.",
  },
  {
    code: "DATE_OF_BIRTH",
    name: "Date of Birth",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "date",
    essential: true,
    description: "Birth date for age verification and legal compliance.",
  },
  {
    code: "NATIONALITY",
    name: "Nationality",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "select",
    essential: true,
    description: "Guest's primary citizenship / nationality.",
  },
  {
    code: "TITLE",
    name: "Title",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "select",
    essential: false,
    description: "Honorific or salutation (Mr, Mrs, Ms, Dr, etc.).",
  },
  {
    code: "MIDDLE_NAME",
    name: "Middle Name",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: false,
    description: "Middle name or secondary given name.",
  },
  {
    code: "PREFERRED_NAME",
    name: "Preferred Name",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: false,
    description: "Informal name or nickname for personalized service.",
  },
  {
    code: "GENDER",
    name: "Gender",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "select",
    essential: false,
    description: "Gender identity for operational records.",
  },
  {
    code: "LANGUAGE",
    name: "Language",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: false,
    description: "Preferred spoken or written language.",
  },
  {
    code: "VIP_STATUS",
    name: "VIP Guest",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: false,
    description: "VIP status designation flag.",
  },
  {
    code: "GUEST_PHOTO",
    name: "Guest Photo",
    category: "personal",
    categoryLabel: "Personal Details",
    fieldType: "text",
    essential: false,
    description: "Profile picture or identification photo.",
  },

  // Contact Information (Basic Step)
  {
    code: "PHONE",
    name: "Mobile Phone",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "phone",
    essential: true,
    description: "Primary mobile phone number.",
  },
  {
    code: "EMAIL",
    name: "Email Address",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "email",
    essential: true,
    description: "Primary email address for reservations and folios.",
  },
  {
    code: "PHONE_ALT",
    name: "Alternative Phone",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "phone",
    essential: false,
    description: "Secondary or landline phone number.",
  },
  {
    code: "EMAIL_ALT",
    name: "Alternative Email",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "email",
    essential: false,
    description: "Secondary email address.",
  },
  {
    code: "PREFERRED_CONTACT_METHOD",
    name: "Preferred Contact Method",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "select",
    essential: false,
    description: "Preferred communication channel (Phone, Email, SMS).",
  },
  {
    code: "PREFERRED_CONTACT_TIME",
    name: "Preferred Contact Time",
    category: "contact",
    categoryLabel: "Contact Information",
    fieldType: "select",
    essential: false,
    description: "Best time of day to contact the guest.",
  },

  // Address Information (Basic Step)
  {
    code: "COUNTRY",
    name: "Country",
    category: "address",
    categoryLabel: "Address Information",
    fieldType: "select",
    essential: true,
    description: "Country of residence.",
  },
  {
    code: "CITY",
    name: "City",
    category: "address",
    categoryLabel: "Address Information",
    fieldType: "text",
    essential: true,
    description: "City or locality.",
  },
  {
    code: "REGION",
    name: "Region / State",
    category: "address",
    categoryLabel: "Address Information",
    fieldType: "text",
    essential: false,
    description: "State, province, or administrative region.",
  },
  {
    code: "POSTAL_CODE",
    name: "Postal Code",
    category: "address",
    categoryLabel: "Address Information",
    fieldType: "text",
    essential: false,
    description: "Postal code or ZIP.",
  },
  {
    code: "ADDRESS_LINE1",
    name: "Street Address",
    category: "address",
    categoryLabel: "Address Information",
    fieldType: "text",
    essential: false,
    description: "Street address line 1.",
  },
];

export const ESSENTIAL_GUEST_FIELD_CODES = new Set<string>(
  INDIVIDUAL_GUEST_CREATION_FIELDS.filter((f) => f.essential).map((f) => f.code),
);
