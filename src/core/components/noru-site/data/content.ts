import type { IconName } from "../components/Icon";

/** One bullet in a feature list. `strong` renders in bold before an em dash. */
export interface Point {
  strong?: string;
  text: string;
}

export interface Offering {
  id: string;
  icon: IconName;
  title: string;
  /** Short text on the home page card. */
  blurb: string;
  /** Intro line under the title on the detail page. */
  lead: string;
  points: Point[];
}

export const PRODUCTS: Offering[] = [
  {
    id: "pms",
    icon: "pms",
    title: "PMS",
    blurb: "Reservations, front office, housekeeping, room rack calendar, night audit and channel manager.",
    lead: "Property Management System. Core system for managing hotel operations end-to-end.",
    points: [
      { strong: "Reservations", text: "booking creation, modification, cancellation" },
      { strong: "Front Office", text: "check-in/check-out, guest folios, walk-ins" },
      { strong: "Housekeeping", text: "room status tracking, cleaning schedules, maintenance flags" },
      { strong: "Room Rack Calendar", text: "visual room availability and booking calendar" },
      { strong: "Night Audit", text: "automated end-of-day financial and occupancy reconciliation" },
      { strong: "Channel Manager Integration", text: "real-time sync with OTAs (Booking.com, Expedia, etc.)" },
      { strong: "Digital Invoice Integration", text: "automated, compliant digital invoicing for guest billing" },
    ],
  },
  {
    id: "rms",
    icon: "rms",
    title: "RMS",
    blurb: "QR code ordering, restaurant management and kitchen order management.",
    lead: "Restaurant Management System. Built for in-house and standalone restaurant operations.",
    points: [
      { strong: "QR Code Ordering", text: "guests scan a QR code to browse the menu and order directly" },
      { strong: "Restaurant Management", text: "table management, order flow, staff coordination" },
      { strong: "Order via QR Code", text: "contactless ordering and payment" },
      { strong: "Digital Invoice Integration", text: "automatic invoice generation per order" },
      { strong: "Kitchen Order Management", text: "orders routed live to kitchen display/print stations" },
    ],
  },
  {
    id: "pos",
    icon: "pos",
    title: "Standalone POS",
    blurb: "Simple order taking, tracking and checkout for small restaurants and cafés.",
    lead: "Designed for small restaurants and cafés that need lightweight order management.",
    points: [
      { text: "Order taking and order tracking" },
      { text: "Simple, fast checkout flow" },
      { text: "Digital invoice generation" },
      {
        text: "No dependency on the full PMS/RMS suite — ideal for single-location, small food & beverage businesses",
      },
    ],
  },
  {
    id: "back",
    icon: "back",
    title: "Back Office",
    blurb: "Human resources, inventory, finance & accounting and advanced reporting.",
    lead: "Centralized administrative control for the whole property.",
    points: [
      { strong: "Human Resources", text: "staff records, scheduling, payroll support" },
      { strong: "Inventory Management", text: "stock tracking across departments" },
      { strong: "Finance & Accounting", text: "ledgers, expense tracking, financial statements" },
      {
        strong: "Advanced Reporting Tools",
        text: "customizable dashboards and performance reports across all connected modules",
      },
    ],
  },
];

export const SOLUTIONS: Offering[] = [
  {
    id: "hotels",
    icon: "pms",
    title: "Hotels",
    blurb: "Reservations, reports, staff, finance and inventory from a single dashboard.",
    lead: "Helps hotel managers:",
    points: [
      { text: "Manage reservations from a single dashboard" },
      { text: "Generate operational and financial reports" },
      { text: "Manage staff scheduling and performance" },
      { text: "Control finance and accounting in one place" },
      { text: "Track and manage inventory across departments" },
    ],
  },
  {
    id: "restaurants",
    icon: "rms",
    title: "Restaurants",
    blurb: "Orders, QR ordering, stock usage, accounting and real-time kitchen coordination.",
    lead: "Helps restaurant operators:",
    points: [
      { text: "Manage orders efficiently, including QR-based ordering" },
      { text: "Track restaurant inventory and grocery/stock usage" },
      { text: "Manage restaurant accounting and daily financial records" },
      { text: "Coordinate kitchen and front-of-house operations in real time" },
    ],
  },
  {
    id: "guest",
    icon: "guest",
    title: "Guest Houses",
    blurb: "A lighter-weight hotel solution for smaller properties.",
    lead: "A lighter-weight version of the hotel solution, tailored to smaller properties.",
    points: [
      { text: "Simple reservation and front-office management" },
      { text: "Basic housekeeping tracking" },
      { text: "Optional POS for on-site food & beverage service" },
      { text: "Scaled pricing suited to smaller room counts" },
    ],
  },
  {
    id: "resorts",
    icon: "resorts",
    title: "Resorts",
    blurb: "Core hotel capabilities adapted for larger, multi-facility properties.",
    lead: "The same core capabilities as the Hotel solution, adapted for larger, multi-facility properties.",
    points: [
      { text: "Multi-outlet restaurant and POS management across resort facilities" },
      { text: "Extended housekeeping and maintenance coordination for larger properties" },
      { text: "Consolidated reporting across rooms, F&B outlets, and back office" },
      { text: "Full channel manager integration for high booking volume" },
    ],
  },
];

export interface Plan {
  name: string;
  modules: string;
  /** Price in ETB per year. Null shows "ETB TBA". */
  priceEtb: number | null;
  featured?: boolean;
}

export const HOTEL_PLANS: Plan[] = [
  { name: "Starter", modules: "PMS only", priceEtb: null },
  { name: "Standard", modules: "PMS + RMS", priceEtb: null },
  { name: "Professional", modules: "PMS + Back Office", priceEtb: null },
  { name: "Enterprise", modules: "PMS + RMS + Back Office (Full Suite)", priceEtb: null, featured: true },
];

export const RESTAURANT_PLANS: Plan[] = [
  { name: "Standalone POS", modules: "For small restaurants and cafés", priceEtb: null },
  {
    name: "Full RMS",
    modules: "QR ordering, kitchen management, digital invoicing",
    priceEtb: null,
    featured: true,
  },
];

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ: FaqItem[] = [
  {
    question: "Can Noru Digital Solutions be used by small properties as well as large hotel chains?",
    answer:
      "Yes. The platform is fully scalable — small guest houses and cafés can use standalone modules like POS, while large hotels and resorts can run the full PMS, RMS, and Back Office suite together.",
  },
  {
    question: "Do the modules work together, or can I use them separately?",
    answer:
      "Both. You can subscribe to a single module (e.g., Standalone POS) or combine PMS, RMS, and Back Office into one integrated system.",
  },
  {
    question: "Does the system support channel manager integration?",
    answer: "Yes, the PMS module includes channel manager integration to sync bookings across OTAs in real time.",
  },
  {
    question: "Is digital invoicing supported?",
    answer: "Yes, digital invoice integration is available across PMS, RMS, and Standalone POS.",
  },
  {
    question: "How is pricing calculated?",
    answer:
      "Pricing is billed annually and varies by property type (hotel rooms vs. restaurant covers) and by module (Standalone POS vs. full RMS).",
  },
  {
    question: "How do I get started?",
    answer: "Click Sign Up, submit your details, and our team will review and approve your account before granting system access.",
  },
];

export const PROPERTY_TYPES = ["Hotel", "Restaurant", "Guest House", "Resort"] as const;

export interface Partner {
  id: string;
  name: string;
  /** Optional logo URL. Without it a placeholder tile is shown. */
  logoUrl?: string;
}

export const PARTNERS: Partner[] = Array.from({ length: 8 }, (_, i) => ({
  id: `partner-${i + 1}`,
  name: "Partner logo",
}));

export interface EventItem {
  id: string;
  date: string;
  title: string;
  place: string;
  note: string;
}

/** Replace these placeholders with real events (later: load them from the database). */
export const EVENTS: EventItem[] = Array.from({ length: 4 }, (_, i) => ({
  id: `event-${i + 1}`,
  date: "Date to be confirmed",
  title: "Event name",
  place: "Location",
  note: "Short description of what Noru does at this event.",
}));
