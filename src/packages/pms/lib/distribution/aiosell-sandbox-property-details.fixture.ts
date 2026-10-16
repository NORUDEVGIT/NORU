/**
 * Sanitized Aiosell sandbox property-details body.
 * The second connected_channels row repeats the observed channel object.
 */
const channel = {
  operation: null,
  partner_id: "99",
  hotel_code: "sandbox-pms",
};

export const aiosellSandboxPropertyDetails = {
  address: {
    line: "Narail Khulna",
    city: "Khulna",
    state: "Narail",
    location: {
      long: "12.917836347560788",
      latt: "77.6750138517398",
    },
    country_code: "BD",
  },
  currency: "INR",
  timezone: "Asia/Dhaka",
  contact: {
    phone: "",
    email: "",
    website: "",
  },
  rooms: [
    {
      description: "Free Wifi",
      count: 25,
      active: true,
      type: "primary",
      rateplans: [
        {
          description: "",
          occupancy: 1,
          rateplan_id: "executive-s-ep",
          rateplan_name: "Room Only",
          no_of_meals: 0,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 2,
          rateplan_id: "executive-d-ep",
          rateplan_name: "Room Only",
          no_of_meals: 0,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 1,
          rateplan_id: "executive-s-cp",
          rateplan_name: "Breakfast",
          no_of_meals: 1,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 2,
          rateplan_id: "executive-d-cp",
          rateplan_name: "Breakfast",
          no_of_meals: 2,
          extra_adult: 500,
        },
      ],
      room_id: "executive",
      room_name: "EXECUTIVE",
      min_occ: 1,
      max_occ: 2,
    },
    {
      description: "Free Wifi",
      count: 5,
      active: true,
      type: "primary",
      rateplans: [
        {
          description: "",
          occupancy: 1,
          rateplan_id: "suite-s-ep",
          rateplan_name: "Room Only",
          no_of_meals: 0,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 2,
          rateplan_id: "suite-d-ep",
          rateplan_name: "Room Only",
          no_of_meals: 0,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 1,
          rateplan_id: "suite-s-cp",
          rateplan_name: "Breakfast",
          no_of_meals: 1,
          extra_adult: 500,
        },
        {
          description: "",
          occupancy: 2,
          rateplan_id: "suite-d-cp",
          rateplan_name: "Breakfast",
          no_of_meals: 2,
          extra_adult: 500,
        },
      ],
      room_id: "suite",
      room_name: "SUITE",
      min_occ: 1,
      max_occ: 3,
    },
  ],
  hotel_id: "sandbox-pms",
  hotel_name: "Sandbox PMS",
  property_category: "hotel",
  tax_id: "",
  connected_channels: [channel, { ...channel }],
};
