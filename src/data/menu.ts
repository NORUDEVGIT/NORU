import starters1 from "@/assets/starters-1.jpg";
import starters2 from "@/assets/starters-2.jpg";
import mains1 from "@/assets/mains-1.jpg";
import mains2 from "@/assets/mains-2.jpg";
import burgers1 from "@/assets/burgers-1.jpg";
import burgers2 from "@/assets/burgers-2.jpg";
import pizza1 from "@/assets/pizza-1.jpg";
import pizza2 from "@/assets/pizza-2.jpg";
import sides1 from "@/assets/sides-1.jpg";
import sides2 from "@/assets/sides-2.jpg";
import desserts1 from "@/assets/desserts-1.jpg";
import desserts2 from "@/assets/desserts-2.jpg";
import drinks1 from "@/assets/drinks-1.jpg";
import drinks2 from "@/assets/drinks-2.jpg";

export type DietaryTag = "Vegetarian" | "Vegan" | "Gluten Free";

export type MenuCategory =
  | "Starters"
  | "Main Courses"
  | "Burgers"
  | "Pizza"
  | "Sides"
  | "Desserts"
  | "Drinks";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: MenuCategory;
  image: string;
  dietaryTags?: DietaryTag[] | undefined;
}

export const CATEGORIES: MenuCategory[] = [
  "Starters",
  "Main Courses",
  "Burgers",
  "Pizza",
  "Sides",
  "Desserts",
  "Drinks",
];

export const RESTAURANT = {
  name: "The Garden Table",
  tagline: "Seasonal plates, wood fire and garden greens — ordered straight to your table.",
};

export const MENU_ITEMS: MenuItem[] = [
  // Starters
  {
    id: "st-1",
    name: "Burrata & Heirloom Tomato",
    description: "Creamy burrata, slow roasted tomatoes, basil oil.",
    price: 11.5,
    category: "Starters",
    image: starters1,
    dietaryTags: ["Vegetarian", "Gluten Free"],
  },
  {
    id: "st-2",
    name: "Crispy Calamari",
    description: "Golden fried squid, lemon and herb aioli.",
    price: 10.0,
    category: "Starters",
    image: starters2,
  },
  {
    id: "st-3",
    name: "Garden Bruschetta",
    description: "Sourdough, marinated tomato, garlic, olive oil.",
    price: 8.5,
    category: "Starters",
    image: starters1,
    dietaryTags: ["Vegan"],
  },
  {
    id: "st-4",
    name: "Salt & Pepper Prawns",
    description: "Chilli, spring onion, lime crème fraîche.",
    price: 12.5,
    category: "Starters",
    image: starters2,
    dietaryTags: ["Gluten Free"],
  },

  // Main Courses
  {
    id: "mc-1",
    name: "Pan Seared Salmon",
    description: "Green beans, lemon butter, fresh thyme.",
    price: 21.0,
    category: "Main Courses",
    image: mains1,
    dietaryTags: ["Gluten Free"],
  },
  {
    id: "mc-2",
    name: "Grilled Ribeye",
    description: "28 day aged ribeye, peppercorn sauce, rosemary.",
    price: 29.5,
    category: "Main Courses",
    image: mains2,
  },
  {
    id: "mc-3",
    name: "Herb Roast Chicken",
    description: "Half chicken, garden herbs, pan jus.",
    price: 19.0,
    category: "Main Courses",
    image: mains1,
    dietaryTags: ["Gluten Free"],
  },
  {
    id: "mc-4",
    name: "Wild Mushroom Risotto",
    description: "Arborio rice, seasonal mushrooms, parmesan.",
    price: 17.5,
    category: "Main Courses",
    image: mains2,
    dietaryTags: ["Vegetarian"],
  },

  // Burgers
  {
    id: "bg-1",
    name: "Garden Classic Cheeseburger",
    description: "Aged cheddar, brioche bun, house sauce.",
    price: 15.0,
    category: "Burgers",
    image: burgers1,
  },
  {
    id: "bg-2",
    name: "Smoked Bacon Stack",
    description: "Double patty, smoked bacon, crispy onion.",
    price: 17.0,
    category: "Burgers",
    image: burgers1,
  },
  {
    id: "bg-3",
    name: "Black Bean & Avocado",
    description: "Plant based patty, avocado, rocket, tomato.",
    price: 14.5,
    category: "Burgers",
    image: burgers2,
    dietaryTags: ["Vegan"],
  },
  {
    id: "bg-4",
    name: "Buttermilk Chicken Burger",
    description: "Crisp chicken thigh, slaw, chipotle mayo.",
    price: 15.5,
    category: "Burgers",
    image: burgers2,
  },

  // Pizza
  {
    id: "pz-1",
    name: "Margherita",
    description: "San Marzano tomato, fior di latte, basil.",
    price: 13.0,
    category: "Pizza",
    image: pizza1,
    dietaryTags: ["Vegetarian"],
  },
  {
    id: "pz-2",
    name: "Prosciutto & Rocket",
    description: "Parma ham, rocket, shaved parmesan.",
    price: 16.5,
    category: "Pizza",
    image: pizza2,
  },
  {
    id: "pz-3",
    name: "Garden Vegetable",
    description: "Courgette, peppers, red onion, olives.",
    price: 14.5,
    category: "Pizza",
    image: pizza1,
    dietaryTags: ["Vegan"],
  },
  {
    id: "pz-4",
    name: "Truffle Mushroom",
    description: "Wild mushrooms, truffle oil, mozzarella.",
    price: 16.0,
    category: "Pizza",
    image: pizza2,
    dietaryTags: ["Vegetarian"],
  },

  // Sides
  {
    id: "sd-1",
    name: "Truffle Parmesan Fries",
    description: "Skin on fries, truffle oil, parmesan, parsley.",
    price: 6.5,
    category: "Sides",
    image: sides1,
    dietaryTags: ["Vegetarian"],
  },
  {
    id: "sd-2",
    name: "Garden Leaf Salad",
    description: "Seasonal leaves, herbs, lemon dressing.",
    price: 5.5,
    category: "Sides",
    image: sides2,
    dietaryTags: ["Vegan", "Gluten Free"],
  },
  {
    id: "sd-3",
    name: "Rosemary Potatoes",
    description: "Crushed new potatoes, sea salt, rosemary.",
    price: 5.0,
    category: "Sides",
    image: sides1,
    dietaryTags: ["Vegan", "Gluten Free"],
  },
  {
    id: "sd-4",
    name: "Charred Tenderstem",
    description: "Broccoli, chilli, garlic, olive oil.",
    price: 6.0,
    category: "Sides",
    image: sides2,
    dietaryTags: ["Vegan", "Gluten Free"],
  },

  // Desserts
  {
    id: "ds-1",
    name: "Chocolate Fondant",
    description: "Molten centre, vanilla bean ice cream.",
    price: 8.5,
    category: "Desserts",
    image: desserts1,
    dietaryTags: ["Vegetarian"],
  },
  {
    id: "ds-2",
    name: "Baked Cheesecake",
    description: "Vanilla cheesecake, berry compote.",
    price: 8.0,
    category: "Desserts",
    image: desserts2,
    dietaryTags: ["Vegetarian"],
  },
  {
    id: "ds-3",
    name: "Sticky Toffee Pudding",
    description: "Warm date sponge, toffee sauce, cream.",
    price: 8.0,
    category: "Desserts",
    image: desserts1,
    dietaryTags: ["Vegetarian"],
  },
  {
    id: "ds-4",
    name: "Berry Sorbet",
    description: "Seasonal berries, mint, light and fresh.",
    price: 6.5,
    category: "Desserts",
    image: desserts2,
    dietaryTags: ["Vegan", "Gluten Free"],
  },

  // Drinks
  {
    id: "dr-1",
    name: "Fresh Mint Lemonade",
    description: "Pressed lemon, mint, sparkling water.",
    price: 4.5,
    category: "Drinks",
    image: drinks1,
    dietaryTags: ["Vegan", "Gluten Free"],
  },
  {
    id: "dr-2",
    name: "Flat White",
    description: "Double espresso, silky steamed milk.",
    price: 3.5,
    category: "Drinks",
    image: drinks2,
    dietaryTags: ["Vegetarian", "Gluten Free"],
  },
  {
    id: "dr-3",
    name: "Elderflower Spritz",
    description: "Elderflower, soda, cucumber, ice.",
    price: 5.0,
    category: "Drinks",
    image: drinks1,
    dietaryTags: ["Vegan", "Gluten Free"],
  },
  {
    id: "dr-4",
    name: "Iced Matcha Latte",
    description: "Ceremonial matcha, oat milk, ice.",
    price: 4.8,
    category: "Drinks",
    image: drinks2,
    dietaryTags: ["Vegan", "Gluten Free"],
  },
];

export const formatPrice = (value: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);
