import { type DbClient } from "./rooms.server";

export type CanonicalAmenityDefinition = {
  name: string;
  code: string;
  category: string;
  icon: string;
  description?: string;
};

export const CANONICAL_AMENITY_DEFINITIONS: CanonicalAmenityDefinition[] = [
  // 1. Room Facilities (13)
  { name: "Air Conditioning", code: "RF_AIR_CONDITIONING", category: "Room Facilities", icon: "Snowflake" },
  { name: "Heating", code: "RF_HEATING", category: "Room Facilities", icon: "Flame" },
  { name: "Ceiling Fan", code: "RF_CEILING_FAN", category: "Room Facilities", icon: "Fan" },
  { name: "Desk", code: "RF_DESK", category: "Room Facilities", icon: "Table2" },
  { name: "Chair", code: "RF_CHAIR", category: "Room Facilities", icon: "Armchair" },
  { name: "Wardrobe", code: "RF_WARDROBE", category: "Room Facilities", icon: "PanelsTopLeft" },
  { name: "Safe", code: "RF_SAFE", category: "Room Facilities", icon: "LockKeyhole" },
  { name: "Iron", code: "RF_IRON", category: "Room Facilities", icon: "Shirt" },
  { name: "Ironing Board", code: "RF_IRONING_BOARD", category: "Room Facilities", icon: "PanelsTopLeft" },
  { name: "Mirror", code: "RF_MIRROR", category: "Room Facilities", icon: "Scan" },
  { name: "Hair Dryer", code: "RF_HAIR_DRYER", category: "Room Facilities", icon: "Wind" },
  { name: "Telephone", code: "RF_TELEPHONE", category: "Room Facilities", icon: "Phone" },
  { name: "Alarm Clock", code: "RF_ALARM_CLOCK", category: "Room Facilities", icon: "AlarmClock" },

  // 2. Bathroom (11)
  { name: "Private Bathroom", code: "BATH_PRIVATE_BATHROOM", category: "Bathroom", icon: "Bath" },
  { name: "Shower", code: "BATH_SHOWER", category: "Bathroom", icon: "ShowerHead" },
  { name: "Bathtub", code: "BATH_BATHTUB", category: "Bathroom", icon: "Bath" },
  { name: "Hot Water", code: "BATH_HOT_WATER", category: "Bathroom", icon: "ThermometerSun" },
  { name: "Toiletries", code: "BATH_TOILETRIES", category: "Bathroom", icon: "SprayCan" },
  { name: "Towels", code: "BATH_TOWELS", category: "Bathroom", icon: "Layers" },
  { name: "Bathrobe", code: "BATH_BATHROBE", category: "Bathroom", icon: "Shirt" },
  { name: "Slippers", code: "BATH_SLIPPERS", category: "Bathroom", icon: "Footprints" },
  { name: "Hair Dryer", code: "BATH_HAIR_DRYER", category: "Bathroom", icon: "Wind" },
  { name: "Bidet", code: "BATH_BIDET", category: "Bathroom", icon: "Droplets" },
  { name: "Rain Shower", code: "BATH_RAIN_SHOWER", category: "Bathroom", icon: "CloudRain" },

  // 3. Technology & Connectivity (9)
  { name: "Free Wi-Fi", code: "TECH_FREE_WIFI", category: "Technology & Connectivity", icon: "Wifi" },
  { name: "High-Speed Wi-Fi", code: "TECH_HIGH_SPEED_WIFI", category: "Technology & Connectivity", icon: "Wifi" },
  { name: "Smart TV", code: "TECH_SMART_TV", category: "Technology & Connectivity", icon: "MonitorSmartphone" },
  { name: "TV", code: "TECH_TV", category: "Technology & Connectivity", icon: "Tv" },
  { name: "Cable/Satellite TV", code: "TECH_CABLE_SATELLITE_TV", category: "Technology & Connectivity", icon: "Satellite" },
  { name: "Streaming Services", code: "TECH_STREAMING_SERVICES", category: "Technology & Connectivity", icon: "PlaySquare" },
  { name: "Telephone", code: "TECH_TELEPHONE", category: "Technology & Connectivity", icon: "Phone" },
  { name: "USB Charging Port", code: "TECH_USB_CHARGING_PORT", category: "Technology & Connectivity", icon: "Usb" },
  { name: "Bluetooth Speaker", code: "TECH_BLUETOOTH_SPEAKER", category: "Technology & Connectivity", icon: "Speaker" },

  // 4. Food & Beverage (9)
  { name: "Mini Bar", code: "FB_MINI_BAR", category: "Food & Beverage", icon: "Wine" },
  { name: "Refrigerator", code: "FB_REFRIGERATOR", category: "Food & Beverage", icon: "Refrigerator" },
  { name: "Coffee Machine", code: "FB_COFFEE_MACHINE", category: "Food & Beverage", icon: "Coffee" },
  { name: "Tea/Coffee Maker", code: "FB_TEA_COFFEE_MAKER", category: "Food & Beverage", icon: "Coffee" },
  { name: "Electric Kettle", code: "FB_ELECTRIC_KETTLE", category: "Food & Beverage", icon: "CookingPot" },
  { name: "Bottled Water", code: "FB_BOTTLED_WATER", category: "Food & Beverage", icon: "GlassWater" },
  { name: "Microwave", code: "FB_MICROWAVE", category: "Food & Beverage", icon: "Microwave" },
  { name: "Dining Table", code: "FB_DINING_TABLE", category: "Food & Beverage", icon: "Utensils" },
  { name: "Room Service", code: "FB_ROOM_SERVICE", category: "Food & Beverage", icon: "ConciergeBell" },

  // 5. Bed & Sleeping (9)
  { name: "King Bed", code: "BED_KING_BED", category: "Bed & Sleeping", icon: "BedDouble" },
  { name: "Queen Bed", code: "BED_QUEEN_BED", category: "Bed & Sleeping", icon: "BedDouble" },
  { name: "Twin Beds", code: "BED_TWIN_BEDS", category: "Bed & Sleeping", icon: "BedDouble" },
  { name: "Single Bed", code: "BED_SINGLE_BED", category: "Bed & Sleeping", icon: "BedSingle" },
  { name: "Sofa Bed", code: "BED_SOFA_BED", category: "Bed & Sleeping", icon: "Sofa" },
  { name: "Extra Bed", code: "BED_EXTRA_BED", category: "Bed & Sleeping", icon: "Bed" },
  { name: "Baby Cot", code: "BED_BABY_COT", category: "Bed & Sleeping", icon: "Baby" },
  { name: "Premium Bedding", code: "BED_PREMIUM_BEDDING", category: "Bed & Sleeping", icon: "Sparkles" },
  { name: "Pillow Menu", code: "BED_PILLOW_MENU", category: "Bed & Sleeping", icon: "PackageOpen" },

  // 6. Safety & Security (8)
  { name: "Electronic Door Lock", code: "SAFE_ELECTRONIC_DOOR_LOCK", category: "Safety & Security", icon: "LockKeyhole" },
  { name: "In-Room Safe", code: "SAFE_IN_ROOM_SAFE", category: "Safety & Security", icon: "Lock" },
  { name: "Smoke Detector", code: "SAFE_SMOKE_DETECTOR", category: "Safety & Security", icon: "Siren" },
  { name: "Fire Alarm", code: "SAFE_FIRE_ALARM", category: "Safety & Security", icon: "Siren" },
  { name: "Sprinkler System", code: "SAFE_SPRINKLER_SYSTEM", category: "Safety & Security", icon: "Droplets" },
  { name: "Emergency Exit Information", code: "SAFE_EMERGENCY_EXIT_INFO", category: "Safety & Security", icon: "DoorOpen" },
  { name: "Security Camera", code: "SAFE_SECURITY_CAMERA", category: "Safety & Security", icon: "Cctv" },
  { name: "Door Viewer", code: "SAFE_DOOR_VIEWER", category: "Safety & Security", icon: "Eye" },

  // 7. Accessibility (8)
  { name: "Wheelchair Accessible", code: "ACC_WHEELCHAIR_ACCESSIBLE", category: "Accessibility", icon: "Accessibility" },
  { name: "Accessible Bathroom", code: "ACC_ACCESSIBLE_BATHROOM", category: "Accessibility", icon: "Bath" },
  { name: "Grab Rails", code: "ACC_GRAB_RAILS", category: "Accessibility", icon: "Grip" },
  { name: "Accessible Shower", code: "ACC_ACCESSIBLE_SHOWER", category: "Accessibility", icon: "ShowerHead" },
  { name: "Lowered Sink", code: "ACC_LOWERED_SINK", category: "Accessibility", icon: "Waves" },
  { name: "Accessible Room Entrance", code: "ACC_ROOM_ENTRANCE", category: "Accessibility", icon: "DoorOpen" },
  { name: "Elevator Access", code: "ACC_ELEVATOR_ACCESS", category: "Accessibility", icon: "MoveVertical" },
  { name: "Visual Alarm", code: "ACC_VISUAL_ALARM", category: "Accessibility", icon: "Siren" },

  // 8. Outdoor & View (8)
  { name: "Balcony", code: "OUT_BALCONY", category: "Outdoor & View", icon: "SunMedium" },
  { name: "Terrace", code: "OUT_TERRACE", category: "Outdoor & View", icon: "Trees" },
  { name: "Garden View", code: "OUT_GARDEN_VIEW", category: "Outdoor & View", icon: "Flower2" },
  { name: "City View", code: "OUT_CITY_VIEW", category: "Outdoor & View", icon: "Building2" },
  { name: "Pool View", code: "OUT_POOL_VIEW", category: "Outdoor & View", icon: "Waves" },
  { name: "Mountain View", code: "OUT_MOUNTAIN_VIEW", category: "Outdoor & View", icon: "Mountain" },
  { name: "Sea/Lake View", code: "OUT_SEA_LAKE_VIEW", category: "Outdoor & View", icon: "Waves" },
  { name: "Landmark View", code: "OUT_LANDMARK_VIEW", category: "Outdoor & View", icon: "Landmark" },

  // 9. Recreation & Entertainment (8)
  { name: "Swimming Pool", code: "REC_SWIMMING_POOL", category: "Recreation & Entertainment", icon: "Waves" },
  { name: "Fitness Center", code: "REC_FITNESS_CENTER", category: "Recreation & Entertainment", icon: "Dumbbell" },
  { name: "Spa", code: "REC_SPA", category: "Recreation & Entertainment", icon: "Sparkles" },
  { name: "Sauna", code: "REC_SAUNA", category: "Recreation & Entertainment", icon: "Flame" },
  { name: "Steam Room", code: "REC_STEAM_ROOM", category: "Recreation & Entertainment", icon: "Cloud" },
  { name: "Game Room", code: "REC_GAME_ROOM", category: "Recreation & Entertainment", icon: "Gamepad2" },
  { name: "Children's Play Area", code: "REC_PLAY_AREA", category: "Recreation & Entertainment", icon: "Blocks" },
  { name: "Entertainment Area", code: "REC_ENTERTAINMENT_AREA", category: "Recreation & Entertainment", icon: "Music" },

  // 10. Services (8)
  { name: "Daily Housekeeping", code: "SERV_DAILY_HOUSEKEEPING", category: "Services", icon: "Sparkles" },
  { name: "Laundry Service", code: "SERV_LAUNDRY_SERVICE", category: "Services", icon: "WashingMachine" },
  { name: "Dry Cleaning", code: "SERV_DRY_CLEANING", category: "Services", icon: "Shirt" },
  { name: "Room Service", code: "SERV_ROOM_SERVICE", category: "Services", icon: "ConciergeBell" },
  { name: "Wake-Up Service", code: "SERV_WAKE_UP_SERVICE", category: "Services", icon: "AlarmClock" },
  { name: "Concierge Service", code: "SERV_CONCIERGE_SERVICE", category: "Services", icon: "Bell" },
  { name: "Luggage Storage", code: "SERV_LUGGAGE_STORAGE", category: "Services", icon: "Luggage" },
  { name: "Airport Transfer", code: "SERV_AIRPORT_TRANSFER", category: "Services", icon: "Car" },

  // 11. Property Facilities (10)
  { name: "Restaurant", code: "PROP_RESTAURANT", category: "Property Facilities", icon: "UtensilsCrossed" },
  { name: "Bar", code: "PROP_BAR", category: "Property Facilities", icon: "Wine" },
  { name: "Café", code: "PROP_CAFE", category: "Property Facilities", icon: "Coffee" },
  { name: "Conference Room", code: "PROP_CONFERENCE_ROOM", category: "Property Facilities", icon: "Presentation" },
  { name: "Meeting Room", code: "PROP_MEETING_ROOM", category: "Property Facilities", icon: "Users" },
  { name: "Business Center", code: "PROP_BUSINESS_CENTER", category: "Property Facilities", icon: "BriefcaseBusiness" },
  { name: "Parking", code: "PROP_PARKING", category: "Property Facilities", icon: "CircleParking" },
  { name: "Elevator", code: "PROP_ELEVATOR", category: "Property Facilities", icon: "MoveVertical" },
  { name: "Reception", code: "PROP_RECEPTION", category: "Property Facilities", icon: "ConciergeBell" },
  { name: "24-Hour Front Desk", code: "PROP_FRONT_DESK_24H", category: "Property Facilities", icon: "Clock3" },

  // 12. Family & Children (8)
  { name: "Baby Cot", code: "FAM_BABY_COT", category: "Family & Children", icon: "Baby" },
  { name: "High Chair", code: "FAM_HIGH_CHAIR", category: "Family & Children", icon: "Armchair" },
  { name: "Children's Menu", code: "FAM_CHILDRENS_MENU", category: "Family & Children", icon: "Utensils" },
  { name: "Children's Pool", code: "FAM_CHILDRENS_POOL", category: "Family & Children", icon: "Waves" },
  { name: "Kids' Club", code: "FAM_KIDS_CLUB", category: "Family & Children", icon: "Blocks" },
  { name: "Babysitting Service", code: "FAM_BABYSITTING_SERVICE", category: "Family & Children", icon: "HeartHandshake" },
  { name: "Connecting Rooms", code: "FAM_CONNECTING_ROOMS", category: "Family & Children", icon: "DoorOpen" },
  { name: "Family Room", code: "FAM_FAMILY_ROOM", category: "Family & Children", icon: "Users" },

  // 13. Work & Business (8)
  { name: "Work Desk", code: "WORK_DESK", category: "Work & Business", icon: "BriefcaseBusiness" },
  { name: "Office Chair", code: "WORK_OFFICE_CHAIR", category: "Work & Business", icon: "Armchair" },
  { name: "Laptop Safe", code: "WORK_LAPTOP_SAFE", category: "Work & Business", icon: "Laptop" },
  { name: "Business Center", code: "WORK_BUSINESS_CENTER", category: "Work & Business", icon: "BriefcaseBusiness" },
  { name: "Meeting Room", code: "WORK_MEETING_ROOM", category: "Work & Business", icon: "Users" },
  { name: "Conference Facilities", code: "WORK_CONFERENCE_FACILITIES", category: "Work & Business", icon: "Presentation" },
  { name: "Printer", code: "WORK_PRINTER", category: "Work & Business", icon: "Printer" },
  { name: "Scanner", code: "WORK_SCANNER", category: "Work & Business", icon: "ScanLine" },

  // 14. Housekeeping & Convenience (8)
  { name: "Daily Cleaning", code: "HK_DAILY_CLEANING", category: "Housekeeping & Convenience", icon: "Sparkles" },
  { name: "Extra Towels", code: "HK_EXTRA_TOWELS", category: "Housekeeping & Convenience", icon: "Layers" },
  { name: "Extra Pillows", code: "HK_EXTRA_PILLOWS", category: "Housekeeping & Convenience", icon: "PackageOpen" },
  { name: "Laundry Bag", code: "HK_LAUNDRY_BAG", category: "Housekeeping & Convenience", icon: "ShoppingBag" },
  { name: "Luggage Rack", code: "HK_LUGGAGE_RACK", category: "Housekeeping & Convenience", icon: "Luggage" },
  { name: "Shoe Rack", code: "HK_SHOE_RACK", category: "Housekeeping & Convenience", icon: "Footprints" },
  { name: "Clothes Hangers", code: "HK_CLOTHES_HANGERS", category: "Housekeeping & Convenience", icon: "Shirt" },
  { name: "Umbrella", code: "HK_UMBRELLA", category: "Housekeeping & Convenience", icon: "Umbrella" },
];

export const LEGACY_TO_CANONICAL_CATEGORY_MAP: Record<string, string> = {
  "room amenities": "Room Facilities",
  "bathroom amenities": "Bathroom",
  "technology": "Technology & Connectivity",
  "furniture": "Room Facilities",
  "safety": "Safety & Security",
  "guest comfort": "Room Facilities",
  "kitchen / pantry": "Food & Beverage",
  "outdoor features": "Outdoor & View",
  "outdoor": "Outdoor & View",
};

/**
 * Idempotently provisions any missing canonical amenities for a property.
 * Existing amenity rows and custom amenities are 100% preserved.
 * Legacy category rows are automatically normalized into their canonical counterparts.
 */
export async function bootstrapCanonicalAmenities(
  supabase: any,
  restaurantId: string,
): Promise<{ added: number; totalCanonical: number }> {
  const { data: existing, error } = await supabase
    .from("room_amenities")
    .select("id, code, name, category")
    .eq("restaurant_id", restaurantId);

  if (error) {
    console.error("Failed to load existing room amenities for bootstrap:", error.message);
    return { added: 0, totalCanonical: CANONICAL_AMENITY_DEFINITIONS.length };
  }

  const existingRows: Array<{ id: string; code: string | null; name: string; category: string | null }> =
    existing ?? [];

  // Normalize any legacy category rows to their canonical counterparts
  for (const row of existingRows) {
    if (row.category) {
      const canonicalTarget = LEGACY_TO_CANONICAL_CATEGORY_MAP[row.category.trim().toLowerCase()];
      if (canonicalTarget && canonicalTarget !== row.category) {
        await supabase.from("room_amenities").update({ category: canonicalTarget }).eq("id", row.id);
        row.category = canonicalTarget;
      }
    }
  }

  // Index existing amenities by normalized code and by name+category
  const existingCodes = new Set<string>();
  const existingNameCategory = new Set<string>();
  const seenNames = new Set<string>();

  for (const row of existingRows) {
    if (row.code && row.code.trim()) {
      existingCodes.add(row.code.trim().toLowerCase());
    }
    if (row.name) {
      seenNames.add(row.name);
      if (row.category) {
        const cleanName = row.name.replace(/\u200B/g, "").trim().toLowerCase();
        existingNameCategory.add(`${cleanName}::${row.category.trim().toLowerCase()}`);
      }
    }
  }

  const missingItems = CANONICAL_AMENITY_DEFINITIONS.filter((def) => {
    const codeKey = def.code.toLowerCase();
    const cleanName = def.name.replace(/\u200B/g, "").trim().toLowerCase();
    const nameCatKey = `${cleanName}::${def.category.trim().toLowerCase()}`;
    return !existingCodes.has(codeKey) && !existingNameCategory.has(nameCatKey);
  });

  if (missingItems.length === 0) {
    return { added: 0, totalCanonical: CANONICAL_AMENITY_DEFINITIONS.length };
  }

  const payloads = missingItems.map((def) => {
    let finalName = def.name;
    while (seenNames.has(finalName)) {
      finalName = `${finalName}\u200B`;
    }
    seenNames.add(finalName);
    return {
      restaurant_id: restaurantId,
      name: finalName,
      code: def.code,
      category: def.category,
      icon: def.icon,
      active: true,
      complimentary: true,
      display_to_guest: true,
      internal_only: false,
    };
  });

  const { error: insertError } = await supabase.from("room_amenities").insert(payloads);

  if (insertError) {
    console.warn("Could not insert all canonical amenities in bulk, retrying individually:", insertError.message);
    let successful = 0;
    for (const item of payloads) {
      let currentItem = { ...item };
      let { error: singleErr } = await supabase.from("room_amenities").insert(currentItem);
      if (singleErr && singleErr.code === "23505" && singleErr.message?.includes("name_unique")) {
        currentItem = { ...currentItem, name: `${currentItem.name}\u200B` };
        const retry = await supabase.from("room_amenities").insert(currentItem);
        singleErr = retry.error;
      }
      if (!singleErr) successful++;
    }
    return { added: successful, totalCanonical: CANONICAL_AMENITY_DEFINITIONS.length };
  }

  return { added: payloads.length, totalCanonical: CANONICAL_AMENITY_DEFINITIONS.length };
}
