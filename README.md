# The Garden Table Order

Build a modern, mobile-first restaurant online ordering website.

IMPORTANT:

This is FRONTEND ONLY for now.

Do not create a backend, database, authentication, payment system, Supabase integration, or API.

Use realistic mock data and local state so the complete customer ordering experience can be demonstrated in the browser.

The purpose of the website is for customers who are sitting inside a restaurant to browse the menu and place an order to their table.

CUSTOMER FLOW:

Menu → Select items → Cart → Enter table number → Review order → Place order → Confirmation

DESIGN:

Create a premium, modern restaurant design.

The website should feel like a real restaurant ordering application rather than a generic website.

Design priorities:

- Mobile-first

- Very easy to use

- Large touch-friendly buttons

- Clear food images

- Clear prices

- Minimal unnecessary text

- Fast ordering experience

- Elegant typography

- Professional restaurant appearance

- Responsive on mobile, tablet and desktop

Use a fictional restaurant called "The Garden Table".

MENU:

Create realistic sample menu data with these categories:

1. Starters

2. Main Courses

3. Burgers

4. Pizza

5. Sides

6. Desserts

7. Drinks

Create at least 4 realistic menu items in each category.

Each menu item should have:

- id

- name

- description

- price

- category

- image

- optional dietary tags such as Vegetarian, Vegan or Gluten Free

MENU PAGE:

Create a clean restaurant header containing:

- Restaurant logo/name

- Menu button

- Search icon/button

- Cart button

Below the header show the restaurant name and a short description.

Show the menu categories as a horizontally scrollable category navigation on mobile.

Display menu items as attractive cards.

Each card should show:

- Food image

- Item name

- Short description

- Price

- Add button

Allow customers to add items directly from the card.

FOOD DETAILS:

When a customer selects a menu item, show a food detail view/modal containing:

- Large image

- Item name

- Description

- Price

- Dietary information

- Quantity selector

- Special instructions text box

- Add to order button

CART:

Create a shopping cart.

The cart should show:

- Item image

- Item name

- Price

- Quantity controls

- Remove item button

- Special instructions

- Subtotal

- Total

Show a prominent "Continue to Order" button.

TABLE NUMBER:

Before placing the order, ask the customer for their table number.

Create a simple screen:

"Where are you sitting?"

"Enter your table number"

[ Table number ]

Continue

The customer should not need to create an account.

ORDER REVIEW:

Show:

Table number

Order items

Quantities

Special instructions

Subtotal

Total

Add a prominent:

"Place Order"

button.

ORDER CONFIRMATION:

After clicking Place Order, simulate a successful order.

Show:

"Order Confirmed!"

"Thank you. Your order has been sent to the restaurant."

Show:

- Mock order number, e.g. #1042

- Table number

- Ordered items

- Total

- Estimated preparation time

Add a button:

"Back to Menu"

ORDER STATUS:

Create a simple order status screen that can be accessed from the confirmation page.

Show a visual progress indicator:

Order Received

↓

Preparing

↓

Ready

↓

Served

For the frontend demo, allow the status to be simulated manually with mock state.

IMPORTANT UX DETAILS:

- Keep the cart accessible from every menu screen.

- Show the number of items in the cart.

- Show the cart total.

- Use smooth transitions where appropriate.

- Make buttons large enough for mobile users.

- Prevent placing an order without a table number.

- Prevent checkout with an empty cart.

- Show useful validation messages.

- Keep the customer flow extremely simple.

RESPONSIVE DESIGN:

The primary design target is a customer using their phone while sitting at a restaurant table.

Make mobile the priority.

On desktop, use a wider layout with a polished restaurant menu experience.

TECHNICAL:

Use React and modern component-based architecture.

Use local/mock data for menu items.

Use local state for:

- Cart

- Quantities

- Table number

- Order status

- Order confirmation

Keep the code structured so that a backend/database such as Supabase can be connected later without rebuilding the UI.

Do not implement backend functionality yet.

Do not implement payment yet.

Do not implement customer accounts yet.

Focus entirely on creating a polished frontend prototype of the complete customer ordering experience.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/9c601da0-c98a-448e-8c17-94c1dff00906).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
