// idc. food taxonomy (generic food categories, NOT restaurant-specific dishes).
//
// Each category carries:
//   vibes     — which session vibes it suits (date, fancy, casual, couch, grab, deliver)
//   veg       — true if a vegetarian version is common (does NOT mean every version is vegetarian)
//   allergens — common allergens for the category; used to keep a person's matched dish away from
//               their declared allergies. This is a coarse safety screen, never an allergy guarantee.
//   photo     — Unsplash photo id (Unsplash License: free to use). Photos are REPRESENTATIVE of the
//               category and are never presented as a specific restaurant's dish.
//
// Photos are swappable in one place: change the `photo` id below.

const RAW = [
  // id, name, group, vibes, veg, allergens, photo
  // ── American
  ['burger', 'Burgers', 'American', 'casual couch grab deliver', 0, 'gluten dairy', '1568901346375-23c9450c58cd'],
  ['cheeseburger', 'Bacon Cheeseburger', 'American', 'casual couch grab deliver', 0, 'gluten dairy', '1550547660-d9450f859349'],
  ['wings', 'Chicken Wings', 'American', 'casual couch deliver', 0, '', '1527477396000-e27163b481c2'],
  ['tenders', 'Chicken Tenders', 'American', 'casual couch grab deliver', 0, 'gluten egg', '1562967914-608f82629710'],
  ['steak', 'Steak', 'American', 'date fancy casual', 0, '', '1546833999-b9f581a1996d'],
  ['sandwich', 'Sandwiches', 'American', 'casual couch grab deliver', 1, 'gluten', '1528735602780-2552fd46c7af'],
  ['wrap', 'Wraps', 'American', 'casual grab couch', 1, 'gluten', '1626700051175-6818013e1d4f'],
  ['salad', 'Big Salads', 'American', 'date casual grab', 1, '', '1512621776951-a57141f2eefd'],
  ['loadedfries', 'Loaded Fries', 'American', 'casual couch deliver', 1, 'dairy', '1573080496219-bb080dd4f877'],
  ['soup', 'Soup', 'American', 'casual couch grab', 1, '', '1547592166-23ac45744acd'],
  ['philly', 'Philly Cheesesteak', 'American', 'casual couch grab deliver', 0, 'gluten dairy', '1600891964599-f61ba0e24092'],
  ['hotdog', 'Hot Dogs', 'American', 'casual grab', 0, 'gluten', '1612392062631-94dd858cba88'],
  ['breakfast', 'Breakfast for Dinner', 'American', 'casual couch', 1, 'egg gluten dairy', '1567620905732-2d1ec7ab7445'],
  ['chickensandwich', 'Fried Chicken Sandwich', 'American', 'casual couch grab deliver', 0, 'gluten egg', '1606755962773-d324e0a13086'],
  // ── Upscale / date night
  ['filet', 'Filet Mignon', 'Steakhouse', 'date fancy', 0, '', '1600891964092-4316c288032e'],
  ['ribeye', 'Ribeye', 'Steakhouse', 'date fancy', 0, '', '1558030006-450675393462'],
  ['lamb', 'Lamb Chops', 'Steakhouse', 'date fancy', 0, '', '1514516345957-556ca7d90a29'],
  ['risotto', 'Risotto', 'Italian', 'date fancy', 1, 'dairy', '1476124369491-e7addf5db371'],
  ['scallops', 'Seared Scallops', 'Seafood', 'date fancy', 0, 'shellfish', '1599021456807-25db0f974333'],
  ['charcuterie', 'Charcuterie & Small Plates', 'Shareable', 'date fancy', 1, 'dairy gluten nuts', '1452195100486-9cc805987862'],
  // ── Italian
  ['pizza', 'Pizza', 'Italian', 'casual couch grab deliver', 1, 'gluten dairy', '1513104890138-7c749659a591'],
  ['chickenparm', 'Chicken Parmesan', 'Italian', 'date casual couch deliver', 0, 'gluten dairy egg', '1632778149955-e80f8ceca2e8'],
  ['alfredo', 'Fettuccine Alfredo', 'Italian', 'date casual couch deliver', 1, 'gluten dairy', '1645112411341-6c4fd023714a'],
  ['spaghetti', 'Spaghetti & Meatballs', 'Italian', 'date casual couch deliver', 1, 'gluten', '1551892374-ecf8754cf8b0'],
  ['lasagna', 'Lasagna', 'Italian', 'date casual couch deliver', 1, 'gluten dairy', '1574894709920-11b28e7367e3'],
  ['ravioli', 'Ravioli', 'Italian', 'date fancy casual', 1, 'gluten dairy egg', '1587740908075-9e245070dfaa'],
  ['upscalepasta', 'Handmade Pasta', 'Italian', 'date fancy', 1, 'gluten egg dairy', '1621996346565-e3dbc646d9a9'],
  ['calzone', 'Calzones & Stromboli', 'Italian', 'casual couch deliver', 1, 'gluten dairy', '1536964549204-cce9eab227bd'],
  // ── Mexican
  ['tacos', 'Tacos', 'Mexican', 'casual couch grab deliver', 1, '', '1551504734-5ee1c4a1479b'],
  ['birria', 'Birria Tacos', 'Mexican', 'casual couch grab', 0, 'dairy', '1599974579688-8dbdd335c77f'],
  ['burrito', 'Burritos', 'Mexican', 'casual couch grab deliver', 1, 'gluten dairy', '1584208632869-05fa2b2a5934'],
  ['quesadilla', 'Quesadillas', 'Mexican', 'casual couch grab deliver', 1, 'gluten dairy', '1618040996337-56904b7850b9'],
  ['enchiladas', 'Enchiladas', 'Mexican', 'casual couch deliver', 1, 'dairy', '1534352956036-cd81e27dd615'],
  ['fajitas', 'Fajitas', 'Mexican', 'date casual', 1, '', '1611250188496-e966043a0629'],
  ['nachos', 'Nachos', 'Mexican', 'casual couch deliver', 1, 'dairy', '1513456852971-30c0b8199d4d'],
  ['burritobowl', 'Burrito Bowls', 'Mexican', 'casual grab deliver', 1, '', '1543352634-99a5d50ae78e'],
  // ── Seafood
  ['sushi', 'Sushi', 'Seafood', 'date fancy couch deliver', 1, 'fish shellfish soy', '1579871494447-9811cf80d66c'],
  ['premiumsushi', 'Chef’s Sushi & Sashimi', 'Seafood', 'date fancy', 0, 'fish soy', '1553621042-f6e147245754'],
  ['shrimp', 'Shrimp', 'Seafood', 'date casual couch', 0, 'shellfish', '1565680018434-b513d5e5fd47'],
  ['salmon', 'Grilled Salmon', 'Seafood', 'date fancy casual', 0, 'fish', '1467003909585-2f8a72700288'],
  ['friedfish', 'Fried Fish', 'Seafood', 'casual couch grab', 0, 'fish gluten', '1579208575657-c595a05383b7'],
  ['fishtacos', 'Fish Tacos', 'Seafood', 'casual grab', 0, 'fish', '1512838243191-e81e8f66f1fd'],
  ['crabcakes', 'Crab Cakes', 'Seafood', 'date fancy casual', 0, 'shellfish egg gluten', '1559742811-822873691df8'],
  ['seafoodpasta', 'Seafood Pasta', 'Seafood', 'date fancy', 0, 'shellfish gluten dairy', '1563379926898-05f4575a45d8'],
  ['oysters', 'Oysters', 'Seafood', 'date fancy', 0, 'shellfish', '1606731219412-213c1e68b0f6'],
  ['mahi', 'Blackened Fish', 'Seafood', 'date casual', 0, 'fish', '1519708227418-c8fd9a32b7a2'],
  // ── Asian
  ['ramen', 'Ramen', 'Asian', 'casual couch', 1, 'gluten egg soy', '1569718212165-3a8278d5f624'],
  ['friedrice', 'Fried Rice', 'Asian', 'casual couch grab deliver', 1, 'egg soy', '1603133872878-684f208fb84b'],
  ['lomein', 'Lo Mein', 'Asian', 'casual couch grab deliver', 1, 'gluten soy', '1585032226651-759b368d7246'],
  ['dumplings', 'Dumplings', 'Asian', 'date casual couch deliver', 1, 'gluten soy', '1496116218417-1a781b1c416c'],
  ['stirfry', 'Stir-Fry', 'Asian', 'casual couch grab deliver', 1, 'soy', '1512058564366-18510be2db19'],
  ['teriyaki', 'Teriyaki Chicken', 'Asian', 'casual couch grab deliver', 0, 'soy gluten', '1609183480237-ccbb2d7c5772'],
  ['curry', 'Curry', 'Asian', 'date casual couch deliver', 1, 'dairy', '1565557623262-b51c2513a641'],
  ['padthai', 'Pad Thai', 'Asian', 'casual couch deliver', 1, 'peanuts egg shellfish soy', '1559314809-0d155014e29e'],
  ['pho', 'Pho', 'Asian', 'casual couch', 0, 'fish', '1582878826629-29b7ad1cdc43'],
  ['hibachi', 'Hibachi', 'Asian', 'date casual', 0, 'soy egg', '1617196034796-73dfa7b1fd56'],
  ['generaltso', 'General Tso’s Chicken', 'Asian', 'casual couch deliver', 0, 'gluten soy egg', '1525755662778-989d0524087e'],
  // ── Southern / BBQ
  ['brisket', 'Brisket', 'BBQ', 'casual couch grab', 0, '', '1529193591184-b1d58069ecdd'],
  ['ribs', 'Ribs', 'BBQ', 'casual couch', 0, '', '1544025162-d76694265947'],
  ['pulledpork', 'Pulled Pork', 'BBQ', 'casual couch grab', 0, '', '1623653387945-2fd25214f8fc'],
  ['friedchicken', 'Fried Chicken', 'Southern', 'casual couch grab deliver', 0, 'gluten egg', '1626645738196-c2a7c87a8f58'],
  ['macncheese', 'Mac and Cheese', 'Southern', 'casual couch', 1, 'gluten dairy', '1543339494-b4cd4f7ba686'],
  ['bbqplatter', 'BBQ Platter', 'BBQ', 'casual couch', 0, '', '1555939594-58d7cb561ad1'],
  ['shrimpgrits', 'Shrimp & Grits', 'Southern', 'date casual', 0, 'shellfish dairy', '1625943553852-781c6dd46faa'],
  // ── Mediterranean & more
  ['medbowl', 'Mediterranean Bowls', 'Mediterranean', 'casual grab deliver', 1, 'sesame', '1540420773420-3366772f4999'],
  ['gyro', 'Gyros', 'Mediterranean', 'casual couch grab deliver', 0, 'gluten dairy', '1529006557810-274b9b2fc783'],
  ['kebab', 'Kebabs', 'Mediterranean', 'date casual', 0, '', '1603360946369-dc9bb6258143'],
  ['falafel', 'Falafel', 'Mediterranean', 'casual grab deliver', 1, 'sesame gluten', '1593001874117-c99c800e3eb7'],
  ['poke', 'Poke Bowls', 'Bowls', 'casual grab deliver', 0, 'fish soy sesame', '1546069901-ba9599a7e63c'],
  ['grainbowl', 'Grain Bowls', 'Bowls', 'casual grab deliver', 1, '', '1512621776951-a57141f2eefd'],
  ['vegentree', 'Vegetarian Entrées', 'Vegetarian', 'date casual', 1, '', '1540189549336-e6e99c3679fe'],
  ['wingsboneless', 'Boneless Wings', 'American', 'casual couch deliver', 0, 'gluten', '1608039755401-742074f0548d'],
];

export const FOODS = RAW.map(([id, name, group, vibes, veg, allergens, photo]) => ({
  id,
  name,
  group,
  vibes: vibes.split(' '),
  veg: !!veg,
  allergens: allergens ? allergens.split(' ') : [],
  photo,
}));

export const FOOD_BY_ID = Object.fromEntries(FOODS.map((f) => [f.id, f]));
export const foodName = (id) => FOOD_BY_ID[id]?.name || id;

// Upscale categories get an extra boost for Fancy AF.
export const UPSCALE = new Set(['filet', 'ribeye', 'lamb', 'risotto', 'scallops', 'charcuterie', 'premiumsushi', 'upscalepasta', 'seafoodpasta', 'oysters', 'crabcakes', 'salmon', 'steak']);

export const ALLERGENS = ['shellfish', 'fish', 'peanuts', 'nuts', 'dairy', 'egg', 'gluten', 'soy', 'sesame'];

export function photoUrl(food, w = 900) {
  return `https://images.unsplash.com/photo-${food.photo}?auto=format&fit=crop&w=${w}&q=75`;
}

export const GROUPS = [...new Set(FOODS.map((f) => f.group))];
