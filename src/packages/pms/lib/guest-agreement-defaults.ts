/**
 * Default Guest Agreement package. Stored on the agreement version, not in the UI.
 */
import type { GuestAgreementPackage } from "@/packages/pms/lib/guest-agreement-config";

export const GUEST_AGREEMENT_TITLE = "Hotel Registration Agreement";

export const GUEST_AGREEMENT_INTRO =
  "Please read and agree to the hotel's terms, policies, and applicable charges.";

export const GUEST_AGREEMENT_LEAD_IN =
  "By proceeding with check-in, you acknowledge that you have read, understood, and agree to the following hotel registration terms and conditions:";

export const GUEST_ACKNOWLEDGEMENT_TITLE = "Guest Acknowledgement";

export const GUEST_ACKNOWLEDGEMENT_INTRO =
  "Please confirm the following statements to proceed with check-in.";

export function defaultGuestAgreementPackage(): GuestAgreementPackage {
  return {
    title: GUEST_AGREEMENT_TITLE,
    intro: GUEST_AGREEMENT_INTRO,
    leadIn: GUEST_AGREEMENT_LEAD_IN,
    acknowledgementTitle: GUEST_ACKNOWLEDGEMENT_TITLE,
    acknowledgementIntro: GUEST_ACKNOWLEDGEMENT_INTRO,
    sections: [
      {
        id: "check_in_time",
        title: "Check-in Time",
        descriptionTemplate:
          "Check-in time is {{check_in_time}}. Early check-in is subject to availability.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 10,
      },
      {
        id: "check_out_time",
        title: "Check-out Time",
        descriptionTemplate:
          "Check-out time is {{check_out_time}}. Late check-out is subject to availability and may incur additional charges.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 20,
      },
      {
        id: "identification",
        title: "Identification",
        descriptionTemplate: "A valid government-issued ID is required for all guests at check-in.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 30,
      },
      {
        id: "guest_responsibility",
        title: "Guest Responsibility",
        descriptionTemplate:
          "The guest is responsible for any damages to the room or hotel property caused during their stay.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 40,
      },
      {
        id: "smoking_policy",
        title: "Smoking Policy",
        descriptionTemplate:
          "Smoking is not allowed in rooms and indoor areas. A cleaning fee may be charged for violations.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 50,
      },
      {
        id: "privacy_data_use",
        title: "Privacy & Data Use",
        descriptionTemplate:
          "Personal data will be used for hotel operational purposes, including registration, guest services, and legal compliance, in accordance with the hotel's Privacy Policy.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 60,
      },
      {
        id: "payment_incidental",
        title: "Payment & Incidental Charges",
        descriptionTemplate:
          "You authorize the hotel to charge your account for room charges, applicable taxes, and any incidental charges incurred during your stay.",
        resolvedDescription: null,
        enabled: true,
        displayOrder: 70,
      },
    ],
    acknowledgements: [
      {
        id: "registration_information",
        title: "Registration Information",
        statement: "I confirm that the registration information provided is correct and complete.",
        enabled: true,
        required: true,
        displayOrder: 10,
      },
      {
        id: "hotel_terms",
        title: "Hotel Terms & Conditions",
        statement:
          "I acknowledge and accept the hotel's terms and conditions, including check-in/out times, cancellation policy, and applicable charges.",
        enabled: true,
        required: true,
        displayOrder: 20,
      },
      {
        id: "privacy_data_use",
        title: "Privacy & Data Use",
        statement:
          "I consent to the use of my personal data for hotel operations, guest services, and legal compliance.",
        enabled: true,
        required: true,
        displayOrder: 30,
      },
      {
        id: "payment_authorization",
        title: "Payment Authorization",
        statement:
          "I authorize the hotel to charge my account for room charges, taxes, and any applicable incidental charges.",
        enabled: true,
        required: true,
        displayOrder: 40,
      },
    ],
  };
}
