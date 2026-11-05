// ⚠️ DEMONSTRATION DATA — ALL RESTAURANTS BELOW ARE FICTIONAL.
// Names, menus, prices, hours, coordinates and services are invented to exercise the matching
// logic around Alachua, FL. They are not real businesses, and nothing here describes a real menu.
// Replace with a licensed, verified dataset in Phase 3 (see docs/ARCHITECTURE.md).
//
// Menu verification levels:
//   'dish'       — a specific menu item backed by a current source (demo: pretend source)
//   'category'   — evidence the place serves the category, but no reliable dish details
//   'unverified' — inferred/outdated; NEVER used to qualify a match, shown only as "possible"

export const DEMO_REGION = { name: 'Alachua, FL', lat: 29.7938, lng: -82.496, radius: 25 };
export const DEMO_VERIFIED_ON = '2026-10-15 (demo)';

const V = { d: 'dish', c: 'category', u: 'unverified' };

// [name|null, 'food ids', price, verification, vegetarian?]
const R = [
  {
    id: 'r01', name: 'The Corner Grill', cuisine: 'American', atmosphere: ['casual'], price: 18,
    lat: 29.789, lng: -82.49, svc: 'dinein pickup delivery', deliveryRadius: 8, hours: [11, 22],
    menu: [['Buffalo Wings (10)', 'wings', 14, 'd'], ['Bacon Cheeseburger', 'cheeseburger burger', 15, 'd'], ['8 oz Sirloin', 'steak', 22, 'd'], ['Club Sandwich', 'sandwich', 12, 'd'], ['Chicken Caesar Wrap', 'wrap salad', 12, 'd'], ['Loaded Cheese Fries', 'loadedfries', 9, 'd', 1], ['Chicken Tenders Basket', 'tenders', 13, 'd']],
  },
  {
    id: 'r02', name: 'Oak & Ember', cuisine: 'Wood-fired American', atmosphere: ['romantic', 'upscale'], price: 38,
    lat: 29.781, lng: -82.468, svc: 'dinein', deliveryRadius: 0, hours: [17, 22],
    menu: [['12 oz Ribeye', 'ribeye steak', 42, 'd'], ['Petite Filet', 'filet steak', 46, 'd'], ['Smash Burger', 'burger', 18, 'd'], ['Mushroom Risotto', 'risotto', 26, 'd', 1], ['Seared Scallops', 'scallops', 38, 'd'], ['Lamb Chops', 'lamb', 41, 'd'], ['Chef’s Board', 'charcuterie', 22, 'd']],
  },
  {
    id: 'r03', name: 'The Saucy Chicken', cuisine: 'Chicken joint', atmosphere: ['quick', 'casual'], price: 14,
    lat: 29.802, lng: -82.512, svc: 'dinein pickup delivery', deliveryRadius: 10, hours: [10.5, 23],
    menu: [['Garlic Parm Wings', 'wings', 13, 'd'], ['Boneless Hot Honey Bites', 'wingsboneless', 12, 'd'], ['Nashville Hot Sandwich', 'chickensandwich sandwich', 11, 'd'], ['Tender Combo', 'tenders', 11, 'd'], ['Buffalo Wrap', 'wrap', 10, 'd'], ['Crispy Chicken Salad', 'salad', 12, 'd'], ['Southern Mac', 'macncheese', 6, 'd', 1]],
  },
  {
    id: 'r04', name: 'Little Italy Kitchen', cuisine: 'Italian', atmosphere: ['romantic', 'casual'], price: 24,
    lat: 29.776, lng: -82.475, svc: 'dinein pickup delivery', deliveryRadius: 10, hours: [11, 22],
    menu: [['Margherita Pizza', 'pizza', 16, 'd', 1], ['Chicken Parmigiana', 'chickenparm', 21, 'd'], ['Fettuccine Alfredo', 'alfredo', 18, 'd', 1], ['Spaghetti & Meatballs', 'spaghetti', 17, 'd'], ['Baked Lasagna', 'lasagna', 19, 'd'], ['Cheese Ravioli', 'ravioli', 18, 'd', 1], ['Shrimp Scampi Linguine', 'seafoodpasta shrimp', 24, 'd'], ['Steak Tips', 'steak', 26, 'c']],
  },
  {
    id: 'r05', name: 'Taco After Dark', cuisine: 'Mexican', atmosphere: ['quick', 'casual'], price: 15,
    lat: 29.795, lng: -82.483, svc: 'dinein pickup delivery', deliveryRadius: 8, hours: [11, 25],
    menu: [['Carne Asada Tacos', 'tacos', 13, 'd'], ['Birria Tacos + Consomé', 'birria tacos', 15, 'd'], ['Baja Fish Tacos', 'fishtacos tacos', 14, 'd'], ['California Burrito', 'burrito', 13, 'd'], ['Veggie Burrito Bowl', 'burritobowl', 12, 'd', 1], ['Chicken Quesadilla', 'quesadilla', 11, 'd'], ['Loaded Nachos', 'nachos', 12, 'd', 1], ['Tex-Mex Burger', 'burger', 13, 'd']],
  },
  {
    id: 'r06', name: 'The Backyard Table', cuisine: 'BBQ', atmosphere: ['casual'], price: 22,
    lat: 29.823, lng: -82.531, svc: 'dinein pickup', deliveryRadius: 0, hours: [11, 21],
    menu: [['Sliced Brisket Plate', 'brisket bbqplatter', 22, 'd'], ['Half Rack Ribs', 'ribs', 24, 'd'], ['Pulled Pork Sandwich', 'pulledpork sandwich', 13, 'd'], ['Smoked Wings', 'wings', 14, 'd'], ['Smokehouse Burger', 'burger cheeseburger', 15, 'd'], ['Pit Mac', 'macncheese', 6, 'd', 1], ['Steak', 'steak', null, 'u']],
  },
  {
    id: 'r07', name: 'Noodle House Nine', cuisine: 'Pan-Asian', atmosphere: ['casual'], price: 17,
    lat: 29.67, lng: -82.34, svc: 'dinein pickup delivery', deliveryRadius: 6, hours: [11, 22],
    menu: [['Tonkotsu Ramen', 'ramen', 16, 'd'], ['Veggie Miso Ramen', 'ramen', 15, 'd', 1], ['Shrimp Lo Mein', 'lomein shrimp', 15, 'd'], ['Pork Dumplings (8)', 'dumplings', 9, 'd'], ['Chicken Fried Rice', 'friedrice', 13, 'd'], ['Pad Thai', 'padthai', 15, 'd'], ['Teriyaki Chicken Bowl', 'teriyaki', 14, 'd']],
  },
  {
    id: 'r08', name: 'Bistro on Main', cuisine: 'New American bistro', atmosphere: ['romantic', 'upscale'], price: 34,
    lat: 29.798, lng: -82.497, svc: 'dinein pickup', deliveryRadius: 0, hours: [17, 22.5],
    menu: [['Steak Frites', 'steak', 34, 'd'], ['Truffle Burger', 'burger', 22, 'd'], ['Pappardelle Bolognese', 'upscalepasta', 27, 'd'], ['Pan-Roasted Salmon', 'salmon', 31, 'd'], ['Seasonal Risotto', 'risotto', 26, 'd', 1], ['Harvest Salad', 'salad', 14, 'd', 1], ['Charcuterie', 'charcuterie', 19, 'd']],
  },
  {
    id: 'r09', name: 'The Weekend Slice', cuisine: 'Pizzeria', atmosphere: ['quick', 'casual'], price: 14,
    lat: 29.786, lng: -82.505, svc: 'dinein pickup delivery', deliveryRadius: 9, hours: [11, 24],
    menu: [['Pepperoni Pizza', 'pizza', 15, 'd'], ['Veggie Supreme', 'pizza', 16, 'd', 1], ['Italian Grinder', 'sandwich', 11, 'd'], ['Crispy Wings', 'wings', 13, 'd'], ['Garlic Knot Calzone', 'calzone', 12, 'd', 1], ['Greek Salad', 'salad', 10, 'd', 1]],
  },
  {
    id: 'r10', name: 'Coastal Plate', cuisine: 'Seafood grill', atmosphere: ['casual', 'romantic'], price: 27,
    lat: 29.655, lng: -82.37, svc: 'dinein pickup delivery', deliveryRadius: 7, hours: [11.5, 22],
    menu: [['Grilled Atlantic Salmon', 'salmon', 26, 'd'], ['Fried Shrimp Basket', 'shrimp friedfish', 19, 'd'], ['Blackened Mahi', 'mahi', 24, 'd'], ['Fish & Chips', 'friedfish', 18, 'd'], ['Crab Cakes', 'crabcakes', 27, 'd'], ['Surf & Turf', 'steak shrimp', 36, 'd'], ['Pub Burger', 'burger', 15, 'd'], ['Chicken Tenders', 'tenders', 13, 'd']],
  },
  {
    id: 'r11', name: 'Sunset Supper Club', cuisine: 'Steakhouse', atmosphere: ['upscale', 'romantic'], price: 58,
    lat: 29.652, lng: -82.33, svc: 'dinein', deliveryRadius: 0, hours: [17, 23],
    menu: [['Prime Ribeye', 'ribeye steak', 59, 'd'], ['8 oz Filet', 'filet steak', 62, 'd'], ['Rack of Lamb', 'lamb', 54, 'd'], ['Oysters on the Half Shell', 'oysters', 24, 'd'], ['Lobster Risotto', 'risotto seafoodpasta', 44, 'd'], ['Jumbo Lump Crab Cake', 'crabcakes', 28, 'd'], ['Wedge Salad', 'salad', 14, 'd', 1]],
  },
  {
    id: 'r12', name: 'Southern Comfort Kitchen', cuisine: 'Southern', atmosphere: ['casual'], price: 18,
    lat: 29.737, lng: -82.43, svc: 'dinein pickup delivery', deliveryRadius: 8, hours: [7, 21],
    menu: [['Country Fried Chicken', 'friedchicken', 16, 'd'], ['Pulled Pork Plate', 'pulledpork bbqplatter', 16, 'd'], ['Shrimp & Grits', 'shrimpgrits shrimp', 18, 'd'], ['Classic Burger', 'burger', 13, 'd'], ['Chicken & Waffles', 'breakfast friedchicken', 15, 'd'], ['Baked Mac', 'macncheese', 7, 'd', 1], ['House Salad', 'salad', 8, 'd', 1]],
  },
  {
    id: 'r13', name: 'Koi & Ember', cuisine: 'Japanese', atmosphere: ['romantic', 'casual'], price: 30,
    lat: 29.664, lng: -82.383, svc: 'dinein pickup delivery', deliveryRadius: 6, hours: [11.5, 22],
    menu: [['Spicy Tuna Roll', 'sushi', 9, 'd'], ['Omakase Sashimi', 'premiumsushi sushi', 38, 'd'], ['Avocado Cucumber Roll', 'sushi', 7, 'd', 1], ['Hibachi Steak', 'hibachi steak', 27, 'd'], ['Hibachi Shrimp', 'hibachi shrimp', 25, 'd'], ['Chicken Teriyaki', 'teriyaki', 19, 'd'], ['Vegetable Fried Rice', 'friedrice', 10, 'd', 1], ['Gyoza', 'dumplings', 8, 'd']],
  },
  {
    id: 'r14', name: 'Olive & Oregano', cuisine: 'Mediterranean', atmosphere: ['quick', 'casual'], price: 16,
    lat: 29.69, lng: -82.41, svc: 'dinein pickup delivery', deliveryRadius: 7, hours: [11, 21],
    menu: [['Chicken Shawarma Bowl', 'medbowl', 14, 'd'], ['Lamb Gyro', 'gyro', 12, 'd'], ['Falafel Wrap', 'falafel wrap', 11, 'd', 1], ['Chicken Kebab Plate', 'kebab', 17, 'd'], ['Mezze Bowl', 'medbowl grainbowl', 13, 'd', 1], ['Fattoush Salad', 'salad', 10, 'd', 1]],
  },
  {
    id: 'r15', name: 'Two Rivers Tap House', cuisine: 'Sports bar', atmosphere: ['casual'], price: 19,
    lat: 29.827, lng: -82.597, svc: 'dinein pickup', deliveryRadius: 0, hours: [11, 25],
    menu: [['Double Smash Cheeseburger', 'cheeseburger burger', 15, 'd'], ['Wings by the Dozen', 'wings', 16, 'd'], ['Philly Cheesesteak', 'philly sandwich', 14, 'd'], ['Fish & Chips', 'friedfish', 16, 'd'], ['10 oz NY Strip', 'steak', 27, 'd'], ['Beer Cheese Fries', 'loadedfries', 10, 'd', 1], ['Nachos', 'nachos', null, 'c']],
  },
  {
    id: 'r16', name: 'Golden Wok Express', cuisine: 'Chinese takeout', atmosphere: ['quick', 'casual'], price: 13,
    lat: 29.78, lng: -82.488, svc: 'pickup delivery', deliveryRadius: 8, hours: [11, 22.5],
    menu: [['General Tso’s Chicken', 'generaltso', 13, 'd'], ['Beef Lo Mein', 'lomein', 12, 'd'], ['House Fried Rice', 'friedrice', 11, 'd'], ['Steamed Dumplings', 'dumplings', 8, 'd'], ['Vegetable Stir-Fry', 'stirfry', 11, 'd', 1], ['Shrimp with Garlic Sauce', 'shrimp stirfry', 14, 'd'], ['Chicken Wings', 'wings', 10, 'd']],
  },
  {
    id: 'r17', name: 'Bowl & Bloom', cuisine: 'Fast-casual bowls', atmosphere: ['quick', 'casual'], price: 15,
    lat: 29.661, lng: -82.35, svc: 'dinein pickup delivery', deliveryRadius: 6, hours: [10.5, 21],
    menu: [['Salmon Poke Bowl', 'poke', 16, 'd'], ['Tofu Grain Bowl', 'grainbowl', 13, 'd', 1], ['Chicken Burrito Bowl', 'burritobowl', 13, 'd'], ['Thai Curry Bowl', 'curry', 14, 'd', 1], ['Cobb Salad', 'salad', 13, 'd']],
  },
  {
    id: 'r18', name: 'The Gilded Fork', cuisine: 'Contemporary', atmosphere: ['upscale', 'romantic'], price: 72,
    lat: 29.649, lng: -82.322, svc: 'dinein', deliveryRadius: 0, hours: [17.5, 22],
    menu: [['Wagyu Filet', 'filet steak', 78, 'd'], ['Diver Scallops', 'scallops', 44, 'd'], ['Handmade Tagliatelle', 'upscalepasta', 34, 'd', 1], ['Duck Breast', 'vegentree', null, 'u'], ['Market Vegetable Plate', 'vegentree', 29, 'd', 1], ['Chef’s Sashimi Course', 'premiumsushi', 32, 'd']],
  },
  {
    id: 'r19', name: 'Highway 441 Diner', cuisine: 'Diner', atmosphere: ['casual'], price: 13,
    lat: 29.81, lng: -82.488, svc: 'dinein pickup', deliveryRadius: 0, hours: [6, 22],
    menu: [['Pancake Stack Dinner', 'breakfast', 10, 'd', 1], ['Patty Melt', 'burger sandwich', 12, 'd'], ['Chicken Fried Steak', 'steak friedchicken', 15, 'd'], ['Hot Dog Platter', 'hotdog', 9, 'd'], ['Chicken Noodle Soup', 'soup', 6, 'd'], ['Grilled Cheese & Tomato Soup', 'sandwich soup', 9, 'd', 1]],
  },
  {
    id: 'r20', name: 'Spice Route', cuisine: 'Indian', atmosphere: ['casual', 'romantic'], price: 21,
    lat: 29.672, lng: -82.392, svc: 'dinein pickup delivery', deliveryRadius: 7, hours: [11, 22],
    menu: [['Chicken Tikka Masala', 'curry', 18, 'd'], ['Chana Masala', 'curry', 15, 'd', 1], ['Lamb Seekh Kebab', 'kebab', 19, 'd'], ['Vegetable Biryani', 'friedrice vegentree', 16, 'd', 1], ['Tandoori Salmon', 'salmon', 23, 'd']],
  },
  {
    id: 'r21', name: 'Newberry Smokehouse', cuisine: 'BBQ', atmosphere: ['casual'], price: 20,
    lat: 29.646, lng: -82.607, svc: 'dinein pickup delivery', deliveryRadius: 8, hours: [11, 20.5],
    menu: [['Burnt Ends Plate', 'brisket bbqplatter', 21, 'd'], ['St. Louis Ribs', 'ribs', 23, 'd'], ['Fried Chicken Thighs', 'friedchicken', 14, 'd'], ['Brisket Cheeseburger', 'cheeseburger burger', 15, 'd'], ['Fried Catfish', 'friedfish', 17, 'd'], ['Pimento Mac', 'macncheese', 6, 'd', 1]],
  },
  {
    id: 'r22', name: 'Casa Verde Cantina', cuisine: 'Mexican', atmosphere: ['casual', 'romantic'], price: 22,
    lat: 29.69, lng: -82.37, svc: 'dinein pickup', deliveryRadius: 0, hours: [11, 22],
    menu: [['Sizzling Steak Fajitas', 'fajitas steak', 24, 'd'], ['Shrimp Fajitas', 'fajitas shrimp', 25, 'd'], ['Enchiladas Verdes', 'enchiladas', 16, 'd', 1], ['Street Tacos', 'tacos', 14, 'd'], ['Grilled Fish Tacos', 'fishtacos', 16, 'd'], ['Queso & Chips', 'nachos', 9, 'd', 1]],
  },
  {
    id: 'r23', name: 'Pho Real', cuisine: 'Vietnamese', atmosphere: ['quick', 'casual'], price: 15,
    lat: 29.665, lng: -82.336, svc: 'dinein pickup delivery', deliveryRadius: 5, hours: [11, 21.5],
    menu: [['Beef Pho', 'pho', 14, 'd'], ['Lemongrass Chicken Vermicelli', 'stirfry', 14, 'd'], ['Banh Mi', 'sandwich', 10, 'd'], ['Tofu Spring Rolls', 'dumplings', 7, 'd', 1], ['Shrimp Fried Rice', 'friedrice shrimp', 14, 'd']],
  },
  {
    id: 'r24', name: 'Santa Fe Sub Co.', cuisine: 'Sandwich shop', atmosphere: ['quick', 'casual'], price: 12,
    lat: 29.799, lng: -82.474, svc: 'pickup delivery', deliveryRadius: 10, hours: [10, 21],
    menu: [['Italian Sub', 'sandwich', 11, 'd'], ['Philly Steak Sub', 'philly sandwich', 12, 'd'], ['Turkey Club Wrap', 'wrap', 10, 'd'], ['Veggie Hummus Wrap', 'wrap falafel', 10, 'd', 1], ['Chicken Bacon Ranch', 'sandwich', 11, 'd'], ['Soup of the Day', 'soup', null, 'c']],
  },
];

export const RESTAURANTS = R.map((r) => ({
  id: r.id,
  name: r.name,
  demo: true,
  cuisine: r.cuisine,
  atmosphere: r.atmosphere,
  price: r.price,
  lat: r.lat,
  lng: r.lng,
  services: { dinein: r.svc.includes('dinein'), pickup: r.svc.includes('pickup'), delivery: r.svc.includes('delivery') },
  deliveryRadius: r.deliveryRadius,
  hours: r.hours, // same daily hours; close > 24 means after midnight
  verifiedOn: DEMO_VERIFIED_ON,
  source: 'Fictional demonstration data',
  menu: r.menu.map(([name, foods, price, v, veg], i) => ({
    id: `${r.id}-m${i + 1}`,
    name,
    foods: foods.split(' '),
    price,
    verification: V[v],
    veg: !!veg,
  })),
}));

export const RESTAURANT_BY_ID = Object.fromEntries(RESTAURANTS.map((r) => [r.id, r]));
