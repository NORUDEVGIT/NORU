import React from "react";
import {
  Accessibility,
  AirVent,
  AlarmClock,
  Archive,
  Armchair,
  Baby,
  Bath,
  Bed,
  BedDouble,
  BedSingle,
  Bell,
  Blocks,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Car,
  Cctv,
  CheckCircle2,
  CircleParking,
  Clock3,
  Cloud,
  CloudRain,
  Coffee,
  ConciergeBell,
  CookingPot,
  DoorOpen,
  Droplets,
  Dumbbell,
  Eye,
  Fan,
  Flame,
  Flower2,
  Footprints,
  Gamepad2,
  GlassWater,
  Grip,
  HeartHandshake,
  Hotel,
  Key,
  Landmark,
  Laptop,
  Layers,
  Lock,
  LockKeyhole,
  Luggage,
  Microwave,
  MonitorSmartphone,
  Mountain,
  MoveVertical,
  Music,
  Package,
  PackageOpen,
  PanelsTopLeft,
  Phone,
  PlaySquare,
  Presentation,
  Printer,
  Refrigerator,
  Satellite,
  Scan,
  ScanLine,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShowerHead,
  Siren,
  Snowflake,
  Sofa,
  Sparkles,
  Speaker,
  SprayCan,
  Sun,
  SunMedium,
  Table2,
  Tag,
  ThermometerSun,
  Trees,
  Tv,
  Umbrella,
  Usb,
  Users,
  Utensils,
  UtensilsCrossed,
  Vault,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Wine,
  type LucideIcon,
} from "lucide-react";
import {
  CANONICAL_CATEGORY_ICONS,
  type CanonicalAmenityCategory,
} from "@/packages/pms/lib/rooms-card2-amenities.server";

export const AMENITY_LUCIDE_ICONS: Record<string, LucideIcon> = {
  Accessibility,
  AirVent,
  AlarmClock,
  Archive,
  Armchair,
  Baby,
  Bath,
  Bed,
  BedDouble,
  BedSingle,
  Bell,
  Blocks,
  Briefcase,
  BriefcaseBusiness,
  Building2,
  Car,
  Cctv,
  CheckCircle2,
  CircleParking,
  Clock3,
  Cloud,
  CloudRain,
  Coffee,
  ConciergeBell,
  CookingPot,
  DoorOpen,
  Droplets,
  Dumbbell,
  Eye,
  Fan,
  Flame,
  Flower2,
  Footprints,
  Gamepad2,
  GlassWater,
  Grip,
  HeartHandshake,
  Hotel,
  Key,
  Landmark,
  Laptop,
  Layers,
  Lock,
  LockKeyhole,
  Luggage,
  Microwave,
  MonitorSmartphone,
  Mountain,
  MoveVertical,
  Music,
  Package,
  PackageOpen,
  PanelsTopLeft,
  Phone,
  PlaySquare,
  Presentation,
  Printer,
  Refrigerator,
  Safe: Vault,
  Satellite,
  Scan,
  ScanLine,
  ShieldCheck,
  Shirt,
  ShoppingBag,
  ShowerHead,
  Siren,
  Snowflake,
  Sofa,
  Sparkles,
  Speaker,
  SprayCan,
  Sun,
  SunMedium,
  Table2,
  Tag,
  ThermometerSun,
  Trees,
  Tv,
  Umbrella,
  Usb,
  Users,
  Utensils,
  UtensilsCrossed,
  Vault,
  WashingMachine,
  Waves,
  Wifi,
  Wind,
  Wine,
};

export const PRESET_AMENITY_ICONS = [
  { name: "DoorOpen", label: "Door / Room", icon: DoorOpen },
  { name: "BedDouble", label: "Double Bed", icon: BedDouble },
  { name: "BedSingle", label: "Single Bed", icon: BedSingle },
  { name: "Bath", label: "Bathtub", icon: Bath },
  { name: "ShowerHead", label: "Shower", icon: ShowerHead },
  { name: "Wifi", label: "Wi-Fi", icon: Wifi },
  { name: "Tv", label: "Television", icon: Tv },
  { name: "Snowflake", label: "Air Conditioning", icon: Snowflake },
  { name: "Flame", label: "Heating", icon: Flame },
  { name: "Fan", label: "Ceiling Fan", icon: Fan },
  { name: "Coffee", label: "Coffee / Tea", icon: Coffee },
  { name: "Refrigerator", label: "Refrigerator", icon: Refrigerator },
  { name: "Wine", label: "Mini Bar", icon: Wine },
  { name: "UtensilsCrossed", label: "Dining / Kitchen", icon: UtensilsCrossed },
  { name: "ShieldCheck", label: "Safety / Security", icon: ShieldCheck },
  { name: "LockKeyhole", label: "Electronic Lock", icon: LockKeyhole },
  { name: "Vault", label: "In-Room Safe", icon: Vault },
  { name: "Accessibility", label: "Accessibility", icon: Accessibility },
  { name: "Trees", label: "Garden / Outdoor", icon: Trees },
  { name: "SunMedium", label: "Balcony / Sun", icon: SunMedium },
  { name: "Mountain", label: "View / Mountain", icon: Mountain },
  { name: "Waves", label: "Pool / Sea View", icon: Waves },
  { name: "Dumbbell", label: "Fitness / Gym", icon: Dumbbell },
  { name: "BriefcaseBusiness", label: "Work Desk", icon: BriefcaseBusiness },
  { name: "ConciergeBell", label: "Room Service", icon: ConciergeBell },
  { name: "Sparkles", label: "Housekeeping", icon: Sparkles },
  { name: "Baby", label: "Family / Crib", icon: Baby },
  { name: "Sofa", label: "Living / Sofa", icon: Sofa },
  { name: "Armchair", label: "Chair / Armchair", icon: Armchair },
  { name: "Shirt", label: "Wardrobe / Laundry", icon: Shirt },
  { name: "Building2", label: "Property Facilities", icon: Building2 },
];

export type AmenityIconDisplayProps = {
  icon?: string | null | undefined;
  signedUrl?: string | null | undefined;
  categoryName?: string | null | undefined;
  className?: string | undefined;
  size?: number | undefined;
  alt?: string | undefined;
};

export function AmenityIconDisplay({
  icon,
  signedUrl,
  categoryName,
  className = "h-5 w-5 shrink-0 text-[#251605]",
  size = 20,
  alt = "Amenity icon",
}: AmenityIconDisplayProps) {
  const trimmed = (icon ?? "").trim();
  const urlCandidate =
    signedUrl ||
    (trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
      ? trimmed
      : null);

  if (urlCandidate) {
    return (
      <img
        src={urlCandidate}
        alt={alt}
        className={`${className} object-contain rounded-sm`}
        style={{ width: size, height: size }}
      />
    );
  }

  // Check if icon is a known Lucide key
  if (trimmed && AMENITY_LUCIDE_ICONS[trimmed]) {
    const Component = AMENITY_LUCIDE_ICONS[trimmed];
    return <Component className={className} size={size} aria-hidden="true" />;
  }

  // Fallback to category icon if categoryName is provided
  if (categoryName) {
    const catTrimmed = categoryName.trim();
    const canonicalIconName = CANONICAL_CATEGORY_ICONS[catTrimmed as CanonicalAmenityCategory];
    if (canonicalIconName && AMENITY_LUCIDE_ICONS[canonicalIconName]) {
      const CatComponent = AMENITY_LUCIDE_ICONS[canonicalIconName];
      return <CatComponent className={className} size={size} aria-hidden="true" />;
    }
  }

  // Default fallback icon
  return <Sparkles className={className} size={size} aria-hidden="true" />;
}
