/**
 * Local ISO / E.164 calling-code catalogue for Property Setup phone UI.
 * Presentation only. Does not change stored phone schema.
 */
import { ISO_COUNTRIES } from "./pms-geography.ts";

export type PropertySetupCallingCountry = {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
};

/** ITU-T E.164 country calling codes keyed by ISO 3166-1 alpha-2. */
export const ISO_CALLING_CODES: Record<string, string> = {
  AF: "93",
  AL: "355",
  DZ: "213",
  AD: "376",
  AO: "244",
  AG: "1268",
  AR: "54",
  AM: "374",
  AU: "61",
  AT: "43",
  AZ: "994",
  BS: "1242",
  BH: "973",
  BD: "880",
  BB: "1246",
  BY: "375",
  BE: "32",
  BZ: "501",
  BJ: "229",
  BT: "975",
  BO: "591",
  BA: "387",
  BW: "267",
  BR: "55",
  BN: "673",
  BG: "359",
  BF: "226",
  BI: "257",
  CV: "238",
  KH: "855",
  CM: "237",
  CA: "1",
  CF: "236",
  TD: "235",
  CL: "56",
  CN: "86",
  CO: "57",
  KM: "269",
  CG: "242",
  CD: "243",
  CR: "506",
  CI: "225",
  HR: "385",
  CU: "53",
  CY: "357",
  CZ: "420",
  DK: "45",
  DJ: "253",
  DM: "1767",
  DO: "1809",
  EC: "593",
  EG: "20",
  SV: "503",
  GQ: "240",
  ER: "291",
  EE: "372",
  SZ: "268",
  ET: "251",
  FJ: "679",
  FI: "358",
  FR: "33",
  GA: "241",
  GM: "220",
  GE: "995",
  DE: "49",
  GH: "233",
  GR: "30",
  GD: "1473",
  GT: "502",
  GN: "224",
  GW: "245",
  GY: "592",
  HT: "509",
  HN: "504",
  HU: "36",
  IS: "354",
  IN: "91",
  ID: "62",
  IR: "98",
  IQ: "964",
  IE: "353",
  IL: "972",
  IT: "39",
  JM: "1876",
  JP: "81",
  JO: "962",
  KZ: "7",
  KE: "254",
  KI: "686",
  KW: "965",
  KG: "996",
  LA: "856",
  LV: "371",
  LB: "961",
  LS: "266",
  LR: "231",
  LY: "218",
  LI: "423",
  LT: "370",
  LU: "352",
  MG: "261",
  MW: "265",
  MY: "60",
  MV: "960",
  ML: "223",
  MT: "356",
  MH: "692",
  MR: "222",
  MU: "230",
  MX: "52",
  FM: "691",
  MD: "373",
  MC: "377",
  MN: "976",
  ME: "382",
  MA: "212",
  MZ: "258",
  MM: "95",
  NA: "264",
  NR: "674",
  NP: "977",
  NL: "31",
  NZ: "64",
  NI: "505",
  NE: "227",
  NG: "234",
  KP: "850",
  MK: "389",
  NO: "47",
  OM: "968",
  PK: "92",
  PW: "680",
  PS: "970",
  PA: "507",
  PG: "675",
  PY: "595",
  PE: "51",
  PH: "63",
  PL: "48",
  PT: "351",
  QA: "974",
  RO: "40",
  RU: "7",
  RW: "250",
  KN: "1869",
  LC: "1758",
  VC: "1784",
  WS: "685",
  SM: "378",
  ST: "239",
  SA: "966",
  SN: "221",
  RS: "381",
  SC: "248",
  SL: "232",
  SG: "65",
  SK: "421",
  SI: "386",
  SB: "677",
  SO: "252",
  ZA: "27",
  KR: "82",
  SS: "211",
  ES: "34",
  LK: "94",
  SD: "249",
  SR: "597",
  SE: "46",
  CH: "41",
  SY: "963",
  TW: "886",
  TJ: "992",
  TZ: "255",
  TH: "66",
  TL: "670",
  TG: "228",
  TO: "676",
  TT: "1868",
  TN: "216",
  TR: "90",
  TM: "993",
  TV: "688",
  UG: "256",
  UA: "380",
  AE: "971",
  GB: "44",
  US: "1",
  UY: "598",
  UZ: "998",
  VU: "678",
  VA: "379",
  VE: "58",
  VN: "84",
  YE: "967",
  ZM: "260",
  ZW: "263",
};

export function unicodeFlagFromIso(iso: string): string {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  return String.fromCodePoint(0x1f1e6 + code.charCodeAt(0) - 65, 0x1f1e6 + code.charCodeAt(1) - 65);
}

export const PROPERTY_SETUP_CALLING_COUNTRIES: PropertySetupCallingCountry[] = ISO_COUNTRIES.map(
  (country) => ({
    iso: country.code,
    name: country.name,
    dialCode: ISO_CALLING_CODES[country.code] ?? "",
    flag: unicodeFlagFromIso(country.code),
  }),
).filter((country) => country.dialCode !== "");

export function propertySetupCallingCountry(iso: string): PropertySetupCallingCountry | undefined {
  return PROPERTY_SETUP_CALLING_COUNTRIES.find((row) => row.iso === iso);
}

export function filterPhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export type DecomposedSetupPhone = {
  iso: string | null;
  dialCode: string | null;
  localNumber: string;
  raw: string;
  ambiguous: boolean;
};

const DIAL_CODE_INDEX = [...PROPERTY_SETUP_CALLING_COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

function matchDialCode(
  digits: string,
): { country: PropertySetupCallingCountry; ambiguous: boolean } | null {
  const hits = DIAL_CODE_INDEX.filter(
    (row) => digits === row.dialCode || digits.startsWith(row.dialCode),
  );
  if (hits.length === 0) return null;
  const longest = hits[0]!.dialCode.length;
  const longestHits = hits.filter((row) => row.dialCode.length === longest);
  const preferred =
    longestHits.find((row) => row.iso === "US") ??
    longestHits.find((row) => row.iso === "RU") ??
    longestHits[0]!;
  return { country: preferred, ambiguous: longestHits.length > 1 };
}

export function decomposeSetupPhone(value: string): DecomposedSetupPhone {
  const raw = value.trim();
  if (!raw) {
    return { iso: null, dialCode: null, localNumber: "", raw, ambiguous: false };
  }
  const digits = filterPhoneDigits(raw);
  if (raw.startsWith("+")) {
    const matched = matchDialCode(digits);
    if (!matched) {
      return { iso: null, dialCode: null, localNumber: digits, raw, ambiguous: true };
    }
    return {
      iso: matched.country.iso,
      dialCode: matched.country.dialCode,
      localNumber: digits.slice(matched.country.dialCode.length),
      raw,
      ambiguous: matched.ambiguous,
    };
  }
  return {
    iso: null,
    dialCode: null,
    localNumber: digits,
    raw,
    ambiguous: true,
  };
}

/** Apply defaultIso only when the stored value is empty. Never reinterpret an existing number. */
export function setupPhoneDisplayIso(value: string, defaultIso?: string | null): string | null {
  if (value.trim()) return decomposeSetupPhone(value).iso;
  return defaultIso || null;
}

export function composeSetupPhone(iso: string | null, localNumber: string): string {
  const local = filterPhoneDigits(localNumber);
  if (!local) return "";
  if (!iso) return local;
  const country = propertySetupCallingCountry(iso);
  if (!country) return local;
  return `+${country.dialCode}${local}`;
}
