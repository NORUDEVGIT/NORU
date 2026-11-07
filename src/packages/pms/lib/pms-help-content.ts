import type { PmsModuleNavLabel } from "@/packages/pms/lib/pms-module-nav";

export type PmsHelpTopic = {
  title: string;
  body: string;
};

export type PmsHelpSection = {
  id: string;
  title: string;
  topics: PmsHelpTopic[];
};

export type PmsHelpGuide = {
  moduleName: string;
  sections: PmsHelpSection[];
};

const SHARED_TIPS: PmsHelpSection = {
  id: "tips",
  title: "Tips",
  topics: [
    {
      title: "Stay in this workspace",
      body: "Use the module names in the top bar to move between Front Office, Reservations, and the other hotel desks.",
    },
    {
      title: "Property and date",
      body: "The property name and business date in the top bar show which hotel and operating day you are working on.",
    },
  ],
};

const SHARED_TROUBLESHOOTING: PmsHelpSection = {
  id: "troubleshooting",
  title: "Troubleshooting",
  topics: [
    {
      title: "Action not available",
      body: "If a button is missing or disabled, you may not have access, or the guest/stay may not be in the right status.",
    },
    {
      title: "Information looks out of date",
      body: "Refresh the workspace and confirm you are on the correct property and business date.",
    },
  ],
};

const FRONT_OFFICE: PmsHelpGuide = {
  moduleName: "Front Office",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        {
          title: "Room Rack & Calendar",
          body: "The rack shows occupied stays by room and date. Click a guest stay to open guest actions. Click a room number to create a housekeeping task.",
        },
        {
          title: "Workspace menu",
          body: "Use the menu in the workspace to switch between Arrivals, In-House, Check-Out, and Exceptions without leaving Front Office.",
        },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Arrivals", body: "Find expected arrivals, then check the guest in when they arrive." },
        { title: "Check-In", body: "Confirm the room, guest details, and stay dates before completing check-in." },
        { title: "In-House Guests", body: "Move room, extend stay, add a service, or raise a guest request from the in-house stay." },
        { title: "Check-Out", body: "Complete departure from the stay. Folio charges and payments stay on the guest folio." },
        { title: "Amend Stay", body: "Change dates, occupancy, or room from the stay actions in this workspace." },
        { title: "Cancellation / No-Show", body: "Mark a reservation cancelled or no-show from the matching Front Office list." },
        { title: "Guest Actions", body: "Guest requests, late checkout, and maintenance are opened from the stay, not from the top bar." },
      ],
    },
    {
      id: "status",
      title: "Status Meanings",
      topics: [
        { title: "Expected", body: "The guest is due to arrive on this business date." },
        { title: "In-house", body: "The guest is currently occupying a room." },
        { title: "Due out", body: "The guest is scheduled to check out today." },
        { title: "Exceptions", body: "Items that need desk attention, such as overdue arrivals. An empty list means nothing is waiting." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const RESERVATIONS: PmsHelpGuide = {
  moduleName: "Reservations",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Search", body: "Find a booking by guest name, confirmation number, or stay dates." },
        { title: "Create Reservation", body: "Start a new booking from this workspace. Choose dates, room type, and guest before saving." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Assignment", body: "Assign a room when inventory allows. Unassigned bookings still appear in search." },
        { title: "Amend Reservation", body: "Change dates, guests, or room type from the reservation record." },
        { title: "Groups", body: "Group bookings are managed here when a group is attached to the reservation." },
      ],
    },
    {
      id: "status",
      title: "Status Meanings",
      topics: [
        { title: "Confirmed", body: "The booking is held and waiting for arrival." },
        { title: "Cancelled", body: "The booking is no longer arriving." },
        { title: "Checked in", body: "The stay is now handled in Front Office as an in-house guest." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const GUEST_PROFILE: PmsHelpGuide = {
  moduleName: "Guest Profile",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Guest Search", body: "Search by name, email, or phone to open an existing guest profile." },
        { title: "Guest Identity", body: "Keep the legal name and identification details accurate for check-in and invoices." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Contact Details", body: "Update phone, email, and address so the desk can reach the guest." },
        { title: "Stay History", body: "Previous stays appear on the profile when they belong to this property." },
        { title: "Preferences", body: "Record room and service preferences the desk can use on the next stay." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const ROOMS: PmsHelpGuide = {
  moduleName: "Rooms & Inventory",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Room Setup", body: "Physical rooms and their numbers are maintained in this workspace." },
        { title: "Room Types", body: "Room types define what can be sold and assigned." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Inventory", body: "Check how many rooms of each type are available to sell." },
        { title: "Blocks", body: "Blocks hold rooms for a group or allotment so they are not sold twice." },
        { title: "Room Availability", body: "Use the calendar and availability views to see open rooms by date." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const HOUSEKEEPING: PmsHelpGuide = {
  moduleName: "Housekeeping",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Room Status", body: "See which rooms are clean, dirty, inspected, or out of service." },
        { title: "Cleaning Tasks", body: "Create and complete cleaning tasks for occupied and vacant rooms." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Assignments", body: "Assign rooms or tasks to attendants for the business date." },
        { title: "Inspections", body: "Mark rooms inspected when they are ready for arrival." },
        { title: "Maintenance", body: "Raise or follow a work order when a room cannot be sold until repaired." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const CASHIERING: PmsHelpGuide = {
  moduleName: "Cashiering",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Folios", body: "Each stay has a guest folio for charges and payments. Work on the existing folio rather than opening a new till." },
        { title: "Cashier Shift", body: "Open and close your cashier shift from this workspace when your role allows it." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Charges", body: "Post room and extra charges to the correct folio." },
        { title: "Payments", body: "Record payments against the folio balance." },
        { title: "Deposits", body: "Take or apply a deposit according to the reservation." },
        { title: "Refunds", body: "Issue a refund only from the folio when a payment can be reversed." },
        { title: "Invoices", body: "Print or send invoices from the folio record." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const RATES: PmsHelpGuide = {
  moduleName: "Rate & Revenue",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Rates", body: "Rate plans and daily rates for each room type are maintained here." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Restrictions", body: "Set stay restrictions such as closed to arrival or minimum stay." },
        { title: "Overrides", body: "Use an override only when a supervisor-approved rate change is required." },
        { title: "Occupancy / Revenue views", body: "Review occupancy and revenue for the selected dates. These views do not post charges." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const NIGHT_AUDIT: PmsHelpGuide = {
  moduleName: "Night Audit",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Business Date", body: "Night Audit closes the current hotel day and moves the property to the next business date." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Audit readiness", body: "Clear outstanding arrivals, departures, and cashier work before closing the day." },
        { title: "Exceptions", body: "Resolve listed exceptions so the close can complete." },
        { title: "Close process", body: "Run close only when the checklist is complete. Do not close twice for the same date." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const REPORTS: PmsHelpGuide = {
  moduleName: "Reports",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Filters", body: "Choose the report, then narrow by dates, room type, or status before running it." },
        { title: "Date ranges", body: "Reports use the dates you select. Confirm the business date if the figures look unexpected." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Export", body: "Export when the report supports it. The on-screen result is the same data as the export." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const SETTINGS: PmsHelpGuide = {
  moduleName: "Settings",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "Property setup", body: "Complete the property cards for identity, rooms, rates, and policies before going live." },
      ],
    },
    {
      id: "common-tasks",
      title: "Common Tasks",
      topics: [
        { title: "Operational configuration", body: "Change check-in times, taxes, and house policies from the relevant setup card." },
        { title: "Roles and access", body: "Staff access follows the roles already assigned. Settings does not grant extra access from this panel." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const PMS_HOME: PmsHelpGuide = {
  moduleName: "PMS",
  sections: [
    {
      id: "getting-started",
      title: "Getting Started",
      topics: [
        { title: "PMS Home", body: "This screen is the hotel operating home. Open a module from the top bar to start desk work." },
      ],
    },
    SHARED_TIPS,
    SHARED_TROUBLESHOOTING,
  ],
};

const BY_MODULE: Record<PmsModuleNavLabel, PmsHelpGuide> = {
  "Front Office": FRONT_OFFICE,
  Reservations: RESERVATIONS,
  "Guest Profile": GUEST_PROFILE,
  "Rooms & Inventory": ROOMS,
  Housekeeping: HOUSEKEEPING,
  Cashiering: CASHIERING,
  "Rate & Revenue": RATES,
  "Night Audit": NIGHT_AUDIT,
  Reports: REPORTS,
  Settings: SETTINGS,
};

export function pmsHelpGuide(module: PmsModuleNavLabel | null | undefined): PmsHelpGuide {
  if (module && BY_MODULE[module]) return BY_MODULE[module];
  return PMS_HOME;
}
